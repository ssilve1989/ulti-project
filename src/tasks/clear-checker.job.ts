import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';
import { EmbedBuilder } from 'discord.js';
import {
  EMPTY,
  catchError,
  defer,
  filter,
  lastValueFrom,
  mergeMap,
  toArray,
} from 'rxjs';
import { titleCase } from 'title-case';
import { DiscordService } from '../discord/discord.service.js';
import { Encounter } from '../encounters/encounters.consts.js';
import { FfLogsService } from '../fflogs/fflogs.service.js';
import { SettingsCollection } from '../firebase/collections/settings-collection.js';
import { SignupCollection } from '../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../firebase/models/signup.model.js';
import { sentryReport } from '../sentry/sentry.consts.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { createJob } from './tasks.consts.js';

const concurrencyLimit = 5;

@Injectable()
class ClearCheckerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  // We don't want this job to run in every guild because thats not really necessary
  // so we need some way of identifying which guild the bots in that we want this to run
  // for now we'll just hardcode the guildId
  // private static readonly guildId = '808585230759755817';
  private static readonly guildId = '913492538516717578';
  private readonly checkableEncounters = new Set([
    Encounter.DSR,
    Encounter.TOP,
    Encounter.TEA,
    Encounter.UCOB,
    Encounter.UWU,
  ]);

  private readonly logger = new Logger(ClearCheckerJob.name);
  private readonly job: CronJob;

  constructor(
    private readonly discordService: DiscordService,
    private readonly fflogsService: FfLogsService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupsCollection: SignupCollection,
    private readonly sheetsService: SheetsService,
  ) {
    this.job = createJob('clear-checker', '0 0 0 * * *', () => {
      this.checkClears();
    });
  }

  onApplicationBootstrap() {
    // TODO: remove; for testing
    this.checkClears();
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  checkClears() {
    this.logger.log('Starting Clear Checker job...');

    const task$ = defer(() =>
      this.signupsCollection.findAll({ partyStatus: PartyStatus.ClearParty }),
    ).pipe(
      mergeMap((signups) => signups),
      mergeMap(
        (signup) =>
          this.checkableEncounters.has(signup.encounter)
            ? this.processSignup(signup)
            : EMPTY,
        concurrencyLimit,
      ),
      filter((signup) => !!signup),
      toArray(),
      mergeMap((results) => this.publishResults(results)),
    );

    return lastValueFrom(task$, { defaultValue: undefined });
  }

  /**
   * processes the signup to check if the character has cleared the given encounter
   * @param signup
   * @returns the signup if the character has cleared the encounter so it can be used for further processing
   */
  private processSignup(signup: SignupDocument) {
    this.logger.log(`Checking signup for ${signup.character}`);

    const { encounter, character, world } = signup;
    return this.fflogsService
      .hasClearedEncounter(encounter, {
        name: character,
        server: world,
        region: 'NA',
      })
      .pipe(
        mergeMap(async (hasKilled) => {
          if (hasKilled) {
            this.logger.log(
              `Character ${character} has cleared ${encounter} removing signup`,
            );

            Sentry.getCurrentScope().setExtra('signup', signup);

            await this.removeSignup(signup);
            return signup;
          }
        }),
        catchError((e) => {
          sentryReport(e);
          this.logger.warn(`Error checking signup for ${signup.character}`);
          return EMPTY;
        }),
      );
  }

  private async removeSignup(signup: SignupDocument) {
    const settings = await this.settingsCollection.getSettings(
      ClearCheckerJob.guildId,
    );

    this.logger.log('checking spreadsheet...');
    if (settings?.spreadsheetId) {
      await this.sheetsService.removeSignup(signup, settings.spreadsheetId);
    }

    this.logger.log('spreadsheet check complete');
    this.logger.log('checking for existing review message...');

    if (settings?.reviewChannel && signup.reviewMessageId) {
      await this.discordService
        .deleteMessage(
          ClearCheckerJob.guildId,
          settings.reviewChannel,
          signup.reviewMessageId,
        )
        .catch((err) => {
          sentryReport(err);
        });
    }

    this.logger.log('review message check complete');
    this.logger.log('checking document collection...');

    await this.signupsCollection.removeSignup({
      character: signup.character,
      world: signup.world,
      encounter: signup.encounter,
    });

    this.logger.log('removal complete');
  }

  private async publishResults(results: SignupDocument[]) {
    if (results.length === 0) return;

    const fields = Object.entries(
      Object.groupBy(results, (item) => item.encounter),
    ).map(([encounter, signups]) => {
      const value = signups.map((signup) => signup.character).join('\n');
      return { name: encounter, value: titleCase(value) };
    });

    const embed = new EmbedBuilder()
      .setTitle('Clear Checker Report')
      .setDescription(
        'The following applicants have been found to have cleared the encounters they registered for and have been removed',
      )
      .addFields(fields)
      .setTimestamp();

    const guildId = '913492538516717578';
    const settings = await this.settingsCollection.getSettings(guildId);

    if (!settings?.modChannelId) {
      return;
    }

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: settings.modChannelId,
    });

    return channel?.send({ embeds: [embed] });
  }
}

export { ClearCheckerJob };
