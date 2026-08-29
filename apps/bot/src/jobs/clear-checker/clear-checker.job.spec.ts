import type { LoggerService } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { APIEmbedField, EmbedBuilder } from 'discord.js';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { ErrorService } from '../../error/error.service.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { RemoveSignupEvent } from '../../slash-commands/remove-signup/remove-signup.events.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { ClearCheckerJob } from './clear-checker.job.js';

const GUILD_ID = 'guild-1';
const OTHER_GUILD_ID = 'guild-2';
const SPREADSHEET_ID = 'spreadsheet-1';
const REVIEW_CHANNEL = 'review-channel';
const AUTOMOD_CHANNEL = 'automod-channel';

const DEFAULT_SETTINGS = {
  spreadsheetId: SPREADSHEET_ID,
  reviewChannel: REVIEW_CHANNEL,
  autoModChannelId: AUTOMOD_CHANNEL,
};

function createSignup(overrides: Partial<SignupDocument> = {}): SignupDocument {
  return {
    character: 'Test Character',
    discordId: 'discord-1',
    encounter: Encounter.TOP,
    progPointRequested: 'P1',
    reviewMessageId: 'review-message-1',
    role: 'Tank',
    status: SignupStatus.APPROVED,
    username: 'testuser',
    world: 'Jenova',
    ...overrides,
  } as SignupDocument;
}

function activeEncounter(id: Encounter) {
  return { id, name: id, description: id, active: true };
}

describe('ClearCheckerJob', () => {
  let job: ClearCheckerJob;
  let discordService: Mocked<DiscordService>;
  let encountersCollection: Mocked<EncountersCollection>;
  let errorService: Mocked<ErrorService>;
  let eventBus: Mocked<EventBus>;
  let fflogsService: Mocked<FFLogsService>;
  let jobCollection: Mocked<JobCollection>;
  let settingsCollection: Mocked<SettingsCollection>;
  let sheetsService: Mocked<SheetsService>;
  let signupsCollection: Mocked<SignupCollection>;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ClearCheckerJob],
    })
      .useMocker(createAutoMock)
      .setLogger(createAutoMock() as unknown as LoggerService)
      .compile();

    job = fixture.get(ClearCheckerJob);
    discordService = fixture.get(DiscordService);
    encountersCollection = fixture.get(EncountersCollection);
    errorService = fixture.get(ErrorService);
    eventBus = fixture.get(EventBus);
    fflogsService = fixture.get(FFLogsService);
    jobCollection = fixture.get(JobCollection);
    settingsCollection = fixture.get(SettingsCollection);
    sheetsService = fixture.get(SheetsService);
    signupsCollection = fixture.get(SignupCollection);

    send = vi.fn().mockResolvedValue(undefined);

    // Happy path defaults: one enabled guild, every encounter active, every
    // character has cleared, and every downstream removal succeeds.
    discordService.getGuilds.mockReturnValue([GUILD_ID]);
    discordService.deleteMessage.mockResolvedValue(undefined);
    discordService.getTextChannel.mockResolvedValue({ send } as never);
    jobCollection.getJob.mockResolvedValue({ enabled: true });
    settingsCollection.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    encountersCollection.getActiveEncounters.mockResolvedValue(
      Object.values(Encounter).map(activeEncounter),
    );
    signupsCollection.findAll.mockResolvedValue([]);
    signupsCollection.removeSignup.mockResolvedValue([]);
    sheetsService.batchRemoveClearedSignups.mockResolvedValue(undefined);

    // createAutoMock returns a Promise for every method, but the job consumes
    // this one via firstValueFrom - it must be an Observable or every test throws.
    fflogsService.hasClearedEncounter.mockReturnValue(of(true));
  });

  /** Pulls the embed handed to `channel.send` for the Nth call. */
  const sentEmbed = (call = 0): EmbedBuilder =>
    send.mock.calls[call][0].embeds[0];

  /** The "could not be removed from the spreadsheet" field, if present. */
  const failureField = (call = 0): APIEmbedField | undefined =>
    sentEmbed(call).data.fields?.find((field) =>
      /spreadsheet/i.test(field.name),
    );

  /** Finds the batchRemoveClearedSignups call made for a given encounter. */
  const sheetCallFor = (encounter: Encounter) =>
    sheetsService.batchRemoveClearedSignups.mock.calls.find(
      ([, options]) => options.encounter === encounter,
    );

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // A. Never delete a signup that should have been kept.
  // ---------------------------------------------------------------------------
  describe('when a signup should not be removed', () => {
    it('removes nothing if FFLogs reports the character has not cleared', async () => {
      signupsCollection.findAll.mockResolvedValue([createSignup()]);
      fflogsService.hasClearedEncounter.mockReturnValue(of(false));

      await job.checkClears();

      expect(sheetsService.batchRemoveClearedSignups).not.toHaveBeenCalled();
      expect(discordService.deleteMessage).not.toHaveBeenCalled();
      expect(signupsCollection.removeSignup).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('never checks or removes signups for an inactive encounter', async () => {
      encountersCollection.getActiveEncounters.mockResolvedValue([
        activeEncounter(Encounter.TOP),
      ]);
      signupsCollection.findAll.mockResolvedValue([
        createSignup({ character: 'Active Char', encounter: Encounter.TOP }),
        createSignup({ character: 'Retired Char', encounter: Encounter.UCOB }),
      ]);

      await job.checkClears();

      expect(fflogsService.hasClearedEncounter).toHaveBeenCalledTimes(1);
      expect(fflogsService.hasClearedEncounter).toHaveBeenCalledWith(
        Encounter.TOP,
        expect.objectContaining({ name: 'Active Char' }),
      );
      expect(signupsCollection.removeSignup).toHaveBeenCalledTimes(1);
      expect(signupsCollection.removeSignup).toHaveBeenCalledWith(
        expect.objectContaining({ character: 'Active Char' }),
      );
    });

    it('skips a guild entirely when the job is disabled', async () => {
      jobCollection.getJob.mockResolvedValue({ enabled: false });

      await job.checkClears();

      expect(signupsCollection.findAll).not.toHaveBeenCalled();
    });

    it('skips a guild entirely when the job has never been configured', async () => {
      jobCollection.getJob.mockResolvedValue(undefined);

      await job.checkClears();

      expect(signupsCollection.findAll).not.toHaveBeenCalled();
    });

    it('does not remove a signup whose FFLogs lookup failed, but still removes the others', async () => {
      signupsCollection.findAll.mockResolvedValue([
        createSignup({ character: 'Broken Char' }),
        createSignup({ character: 'Cleared Char' }),
      ]);
      fflogsService.hasClearedEncounter.mockImplementation((_, { name }) =>
        name === 'Broken Char'
          ? throwError(() => new Error('fflogs is down'))
          : of(true),
      );

      await job.checkClears();

      expect(errorService.captureError).toHaveBeenCalledTimes(1);
      expect(signupsCollection.removeSignup).toHaveBeenCalledTimes(1);
      expect(signupsCollection.removeSignup).toHaveBeenCalledWith(
        expect.objectContaining({ character: 'Cleared Char' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // B. When a signup should be removed, remove it from all three systems.
  // ---------------------------------------------------------------------------
  describe('when a signup has cleared', () => {
    it('removes it from the spreadsheet, Discord and the database', async () => {
      const signup = createSignup();
      signupsCollection.findAll.mockResolvedValue([signup]);

      await job.checkClears();

      expect(sheetsService.batchRemoveClearedSignups).toHaveBeenCalledWith(
        [signup],
        {
          encounter: Encounter.TOP,
          spreadsheetId: SPREADSHEET_ID,
          partyTypes: [PartyStatus.ClearParty, PartyStatus.ProgParty],
        },
      );
      expect(discordService.deleteMessage).toHaveBeenCalledWith(
        GUILD_ID,
        REVIEW_CHANNEL,
        'review-message-1',
      );
      expect(signupsCollection.removeSignup).toHaveBeenCalledWith({
        character: 'Test Character',
        world: 'Jenova',
        encounter: Encounter.TOP,
      });
    });

    it('batches spreadsheet removals per encounter rather than in one bulk call', async () => {
      signupsCollection.findAll.mockResolvedValue([
        createSignup({ character: 'Top One', encounter: Encounter.TOP }),
        createSignup({ character: 'Top Two', encounter: Encounter.TOP }),
        createSignup({ character: 'Fru One', encounter: Encounter.FRU }),
      ]);

      await job.checkClears();

      expect(sheetsService.batchRemoveClearedSignups).toHaveBeenCalledTimes(2);

      const [topSignups] = sheetCallFor(Encounter.TOP) ?? [];
      const [fruSignups] = sheetCallFor(Encounter.FRU) ?? [];

      expect(topSignups?.map((s) => s.character).sort()).toEqual([
        'Top One',
        'Top Two',
      ]);
      expect(fruSignups?.map((s) => s.character)).toEqual(['Fru One']);
    });

    it('publishes a RemoveSignupEvent per removed signup so roles get stripped', async () => {
      signupsCollection.findAll.mockResolvedValue([
        createSignup({ character: 'Char A', discordId: 'discord-a' }),
        createSignup({ character: 'Char B', discordId: 'discord-b' }),
      ]);

      await job.checkClears();

      expect(eventBus.publish).toHaveBeenCalledTimes(2);
      expect(eventBus.publish).toHaveBeenCalledWith(
        new RemoveSignupEvent(
          {
            character: 'Char A',
            world: 'Jenova',
            encounter: Encounter.TOP,
          },
          { guildId: GUILD_ID, discordId: 'discord-a' },
        ),
      );
    });

    it('processes every enabled guild', async () => {
      discordService.getGuilds.mockReturnValue([GUILD_ID, OTHER_GUILD_ID]);
      signupsCollection.findAll.mockResolvedValue([createSignup()]);

      await job.checkClears();

      expect(signupsCollection.findAll).toHaveBeenCalledTimes(2);
    });
  });

  it('does nothing when no signups have cleared', async () => {
    signupsCollection.findAll.mockResolvedValue([createSignup()]);
    fflogsService.hasClearedEncounter.mockReturnValue(of(false));

    await job.checkClears();

    expect(sheetsService.batchRemoveClearedSignups).not.toHaveBeenCalled();
    expect(discordService.deleteMessage).not.toHaveBeenCalled();
    expect(signupsCollection.removeSignup).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(discordService.getTextChannel).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // C. Partial failures must not strand the signup in a half-removed state.
  // ---------------------------------------------------------------------------
  describe('when part of the removal fails', () => {
    beforeEach(() => {
      signupsCollection.findAll.mockResolvedValue([createSignup()]);
    });

    it('still removes from Discord and the database when no spreadsheet is configured', async () => {
      settingsCollection.getSettings.mockResolvedValue({
        reviewChannel: REVIEW_CHANNEL,
        autoModChannelId: AUTOMOD_CHANNEL,
      });

      await job.checkClears();

      expect(sheetsService.batchRemoveClearedSignups).not.toHaveBeenCalled();
      expect(discordService.deleteMessage).toHaveBeenCalled();
      expect(signupsCollection.removeSignup).toHaveBeenCalled();
    });

    it('still removes from the database when there is no review message to delete', async () => {
      signupsCollection.findAll.mockResolvedValue([
        createSignup({ reviewMessageId: undefined }),
      ]);

      await job.checkClears();

      expect(discordService.deleteMessage).not.toHaveBeenCalled();
      expect(signupsCollection.removeSignup).toHaveBeenCalled();
    });

    it('still removes from the database when the Discord message delete fails', async () => {
      discordService.deleteMessage.mockRejectedValue(
        new Error('missing permissions'),
      );

      await expect(job.checkClears()).resolves.not.toThrow();

      expect(errorService.captureError).toHaveBeenCalled();
      expect(signupsCollection.removeSignup).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('still publishes the removal event when the database delete fails', async () => {
      signupsCollection.removeSignup.mockRejectedValue(
        new Error('firestore unavailable'),
      );

      await expect(job.checkClears()).resolves.not.toThrow();

      expect(errorService.captureError).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
    });

    describe('and the spreadsheet removal fails', () => {
      const sheetError = new Error('Invalid SheetID for encounter TOP');

      beforeEach(() => {
        sheetsService.batchRemoveClearedSignups.mockRejectedValue(sheetError);
      });

      it('still removes the signup from Discord and the database', async () => {
        await expect(job.checkClears()).resolves.not.toThrow();

        expect(discordService.deleteMessage).toHaveBeenCalled();
        expect(signupsCollection.removeSignup).toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
      });

      it('reports the orphaned spreadsheet rows in the summary embed', async () => {
        await job.checkClears();

        const field = failureField();

        expect(field).toBeDefined();
        expect(field?.value).toContain('Test Character');
        expect(field?.value).toContain('Jenova');
      });

      it('logs the underlying error without raising a separate Sentry event', async () => {
        const logger = vi
          .spyOn(job['logger'], 'error')
          .mockImplementation(() => {});

        await job.checkClears();

        expect(logger).toHaveBeenCalledWith(
          expect.stringContaining(Encounter.TOP),
          sheetError,
        );
        expect(errorService.captureError).not.toHaveBeenCalled();
      });

      it('reports only the encounters that failed, and removes the rest normally', async () => {
        sheetsService.batchRemoveClearedSignups.mockImplementation(
          (_, { encounter }) =>
            encounter === Encounter.FRU
              ? Promise.reject(sheetError)
              : Promise.resolve(),
        );
        signupsCollection.findAll.mockResolvedValue([
          createSignup({ character: 'Top One', encounter: Encounter.TOP }),
          createSignup({ character: 'Fru One', encounter: Encounter.FRU }),
        ]);

        await job.checkClears();

        // both are gone from the system of record regardless of the sheet outcome
        expect(signupsCollection.removeSignup).toHaveBeenCalledTimes(2);
        expect(eventBus.publish).toHaveBeenCalledTimes(2);

        const field = failureField();
        expect(field?.value).toContain('Fru One');
        expect(field?.value).not.toContain('Top One');
      });

      it('does not abandon the remaining guilds', async () => {
        discordService.getGuilds.mockReturnValue([GUILD_ID, OTHER_GUILD_ID]);

        await expect(job.checkClears()).resolves.not.toThrow();

        expect(signupsCollection.findAll).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // D. Reporting and lifecycle.
  // ---------------------------------------------------------------------------
  describe('summary report', () => {
    beforeEach(() => {
      signupsCollection.findAll.mockResolvedValue([createSignup()]);
    });

    it('posts the removal count to the automod channel', async () => {
      await job.checkClears();

      expect(discordService.getTextChannel).toHaveBeenCalledWith({
        guildId: GUILD_ID,
        channelId: AUTOMOD_CHANNEL,
      });
      expect(sentEmbed().data.description).toContain('1');
    });

    it('is skipped when no automod channel is configured', async () => {
      settingsCollection.getSettings.mockResolvedValue({
        spreadsheetId: SPREADSHEET_ID,
        reviewChannel: REVIEW_CHANNEL,
      });

      await job.checkClears();

      expect(discordService.getTextChannel).not.toHaveBeenCalled();
      expect(signupsCollection.removeSignup).toHaveBeenCalled();
    });

    it('omits the failure field entirely when every spreadsheet removal succeeded', async () => {
      await job.checkClears();

      expect(failureField()).toBeUndefined();
    });

    it('truncates the failure list to fit inside Discord’s field limit', async () => {
      const signups = Array.from({ length: 60 }, (_, i) =>
        createSignup({ character: `Character Number ${i}` }),
      );
      signupsCollection.findAll.mockResolvedValue(signups);
      sheetsService.batchRemoveClearedSignups.mockRejectedValue(
        new Error('sheet is gone'),
      );

      await job.checkClears();

      const field = failureField();

      expect(field?.value.length).toBeLessThanOrEqual(1024);
      expect(field?.value).toMatch(/\d+ more/);
    });
  });

  it('contains an unexpected guild failure to that guild', async () => {
    discordService.getGuilds.mockReturnValue([GUILD_ID, OTHER_GUILD_ID]);
    signupsCollection.findAll.mockResolvedValue([createSignup()]);
    settingsCollection.getSettings.mockImplementation((guildId: string) =>
      guildId === GUILD_ID
        ? Promise.reject(new Error('firestore unavailable'))
        : Promise.resolve(DEFAULT_SETTINGS),
    );

    await expect(job.checkClears()).resolves.not.toThrow();

    expect(errorService.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        message: expect.stringContaining(GUILD_ID),
      }),
    );
    // the healthy guild was still fully processed
    expect(signupsCollection.removeSignup).toHaveBeenCalledTimes(1);
  });

  describe('lifecycle', () => {
    it('starts the cron job on bootstrap and stops it on shutdown', () => {
      const start = vi
        .spyOn(job['job'], 'start')
        .mockImplementation(() => undefined as never);
      const stop = vi
        .spyOn(job['job'], 'stop')
        .mockImplementation(() => Promise.resolve() as never);

      job.onApplicationBootstrap();
      expect(start).toHaveBeenCalled();

      job.onApplicationShutdown();
      expect(stop).toHaveBeenCalled();
    });

    it('routes a failed run to the error service instead of an unhandled rejection', async () => {
      vi.spyOn(job, 'checkClears').mockRejectedValue(new Error('run failed'));

      await job['job'].fireOnTick();

      await vi.waitFor(() =>
        expect(errorService.captureError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ message: 'clear-checker job failed' }),
        ),
      );
    });
  });
});
