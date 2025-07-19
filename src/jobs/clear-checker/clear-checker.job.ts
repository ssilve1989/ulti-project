import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { CronJob } from 'cron';
import { EmbedBuilder } from 'discord.js';
import {
  EMPTY,
  filter,
  firstValueFrom,
  forkJoin,
  from,
  lastValueFrom,
  mergeMap,
  of,
  tap,
  toArray,
} from 'rxjs';
import { CronTime } from '../../common/cron.js';
import { DiscordService } from '../../discord/discord.service.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { RemoveSignupEvent } from '../../slash-commands/remove-signup/remove-signup.events.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';
import { clearCheckerConfig } from './clear-checker.config.js';

@Injectable()
class ClearCheckerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ClearCheckerJob.name);
  private readonly job: CronJob;

  constructor(
    @Inject(clearCheckerConfig.KEY)
    private readonly config: ConfigType<typeof clearCheckerConfig>,
    private readonly discordService: DiscordService,
    private readonly encountersCollection: EncountersCollection,
    private readonly eventBus: EventBus,
    private readonly fflogsService: FFLogsService,
    private readonly jobCollection: JobCollection,
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly signupsCollection: SignupCollection,
  ) {
    this.job = createJob('clear-checker', {
      cronTime: CronTime.everyDay().at(3),
      onTick: () => {
        this.checkClears();
      },
    });
  }

  onApplicationBootstrap() {
    this.job.start();
    this.logger.log(
      `daily run scheduled for: ${jobDateFormatter.format(this.job.nextDate().toJSDate())}`,
    );
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  checkClears() {
    this.logger.log('starting clear checker job...');

    const guilds = this.discordService.getGuilds();

    const task$ = from(guilds).pipe(
      mergeMap((guild) => {
        this.logger.debug(`checking ${guild} for clear checker job...`);

        return from(this.jobCollection.getJob(guild, 'clear-checker')).pipe(
          mergeMap((job) => (job?.enabled ? of(guild) : EMPTY)),
        );
      }),
      mergeMap((guildId) => this.processGuild(guildId)),
    );

    return lastValueFrom(task$, { defaultValue: undefined });
  }

  private processGuild(guildId: string) {
    return forkJoin({
      signups: this.signupsCollection.findAll({}),
      encounters: this.encountersCollection.getActiveEncounters(),
    }).pipe(
      mergeMap(({ signups, encounters }) => {
        const encounterIds = new Set<Encounter>(
          encounters.map((encounter) => encounter.id as Encounter),
        );

        return from(signups).pipe(
          mergeMap(
            (signup, index) => this.processSignup(signup, encounterIds, index),
            this.config.CLEAR_CHECKER_CONCURRENCY,
          ),
        );
      }),
      filter((signup) => !!signup),
      toArray(),
      mergeMap(async (results) => {
        await this.removeSignups(results, guildId);
        await this.publishResults(results, guildId);
        return results;
      }),
      tap((results) => this.publishEvents(results, guildId)),
    );
  }

  /**
   * processes the signup to check if the character has cleared the given encounter
   * @param signup
   * @returns the signup if the character has cleared the encounter so it can be used for further processing
   */
  private async processSignup(
    signup: SignupDocument,
    encounterIds: Set<Encounter>,
    index: number,
  ): Promise<SignupDocument | undefined> {
    if (!encounterIds.has(signup.encounter)) return;

    Sentry.getCurrentScope().setExtras({ signup, index });
    this.logger.debug(`[${index}] checking signup for ${signup.character}`);

    const { encounter, character, world } = signup;

    try {
      const hasCleared = await firstValueFrom(
        this.fflogsService.hasClearedEncounter(encounter, {
          name: character,
          server: world,
          region: 'NA',
        }),
      );

      return hasCleared ? signup : undefined;
    } catch (e) {
      sentryReport(e);
      this.logger.warn(`error checking signup for ${signup.character}`);
    }

    return undefined;
  }

  private async removeSignups(signups: SignupDocument[], guildId: string) {
    this.logger.log(`removing ${signups.length} signups`);

    const settings = await this.settingsCollection.getSettings(guildId);

    if (settings?.spreadsheetId) {
      // Group signups by encounter since each call to batchRemoveClearedSignups handles one encounter
      const signupsByEncounter = Object.groupBy(
        signups,
        (signup) => signup.encounter,
      );

      // Process each encounter group separately
      for (const [encounter, encounterSignups] of Object.entries(
        signupsByEncounter,
      )) {
        await this.sheetsService.batchRemoveClearedSignups(encounterSignups, {
          encounter: encounter as Encounter,
          spreadsheetId: settings.spreadsheetId,
          partyTypes: [PartyStatus.ClearParty, PartyStatus.ProgParty],
        });
      }
    }

    for (const signup of signups) {
      await Promise.all([
        this.removeSignupFromDiscord({
          guildId,
          reviewChannel: settings?.reviewChannel,
          reviewMessageId: signup.reviewMessageId,
          character: signup.character,
        }),
        this.removeSignupFromDatabase(signup),
      ]);

      this.logger.log(
        `successfully removed signup ${signup.character} - ${signup.encounter}`,
      );
    }
  }

  private removeSignupFromDiscord({
    guildId,
    reviewChannel,
    reviewMessageId,
    character,
  }: {
    guildId: string;
    reviewChannel?: string;
    reviewMessageId?: string;
    character: string;
  }) {
    if (!reviewChannel || !reviewMessageId) return;

    return this.discordService
      .deleteMessage(guildId, reviewChannel, reviewMessageId)
      .catch((err) => {
        this.logger.warn(`error removing signup for ${character}`);
        sentryReport(err);
      });
  }

  private removeSignupFromDatabase(signup: SignupDocument) {
    return this.signupsCollection
      .removeSignup({
        character: signup.character,
        world: signup.world,
        encounter: signup.encounter,
      })
      .catch((err) => {
        this.logger.warn(`error removing signup for ${signup.character}`);
        sentryReport(err);
      });
  }

  private async publishResults(results: SignupDocument[], guildId: string) {
    if (results.length === 0) return;

    const settings = await this.settingsCollection.getSettings(guildId);

    if (!settings?.modChannelId) {
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(':broom: Clear Checker :broom:')
      .setDescription(`${results.length} signups have been removed!`)
      .setTimestamp();

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: settings.modChannelId,
    });

    return await channel?.send({ embeds: [embed] });
  }

  // emits events for each signup that was remove to remove their roles
  private publishEvents(results: SignupDocument[], guildId: string) {
    for (const { discordId, character, world, encounter } of results) {
      this.eventBus.publish(
        new RemoveSignupEvent(
          { character, world, encounter },
          {
            guildId,
            discordId,
          },
        ),
      );
    }
  }
}

export { ClearCheckerJob };
