import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';
import { EmbedBuilder } from 'discord.js';
import {
  EMPTY,
  catchError,
  filter,
  from,
  lastValueFrom,
  mergeMap,
  of,
  toArray,
} from 'rxjs';
import { titleCase } from 'title-case';
import { DiscordService } from '../../discord/discord.service.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../encounters/encounters.consts.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { type SignupDocument } from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { createJob } from '../tasks.consts.js';
import { clearCheckerConfig } from './clear-checker.config.js';

@Injectable()
class ClearCheckerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly checkableEncounters = new Set([Encounter.FRU]);
  private readonly logger = new Logger(ClearCheckerJob.name);
  private readonly job: CronJob;

  constructor(
    private readonly discordService: DiscordService,
    private readonly fflogsService: FFLogsService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupsCollection: SignupCollection,
    private readonly sheetsService: SheetsService,
    private readonly jobCollection: JobCollection,
    @Inject(clearCheckerConfig.KEY)
    private readonly config: ConfigType<typeof clearCheckerConfig>,
  ) {
    const everyMinute = '0 * * * * *';
    const cronString = '0 0 14 * * *';
    this.job = createJob('clear-checker-cron', everyMinute, () => {
      this.checkClears();
    });
  }

  onApplicationBootstrap() {
    this.job.start();
  }

  onApplicationShutdown() {
    this.job.stop();
  }

  checkClears() {
    this.logger.log('starting clear checker job...');

    const guilds = this.discordService.getGuilds();

    const task$ = from(guilds).pipe(
      mergeMap((guild) => {
        this.logger.log(`checking ${guild} for clear checker job...`);
        return from(this.jobCollection.getJob(guild, 'clear-checker')).pipe(
          mergeMap((job) => {
            this.logger.log(
              `Job enabled for guild ${guild}: ${!!job?.enabled}`,
            );
            return job?.enabled ? of(guild) : EMPTY;
          }),
        );
      }),
      mergeMap((guildId) => this.processGuild(guildId)),
    );

    return lastValueFrom(task$, { defaultValue: undefined });
  }

  private processGuild(guildId: string) {
    return from(this.signupsCollection.findAll({})).pipe(
      mergeMap((signups) => {
        this.logger.log(`Checking ${signups.length} signups`);
        return signups;
      }),
      mergeMap(
        (signup) =>
          this.checkableEncounters.has(signup.encounter)
            ? this.processSignup(signup, guildId)
            : EMPTY,
        this.config.CLEAR_CHECKER_CONCURRENCY,
      ),
      filter((signup) => !!signup),
      toArray(),
      mergeMap((results) => this.publishResults(results, guildId)),
    );
  }

  /**
   * processes the signup to check if the character has cleared the given encounter
   * @param signup
   * @returns the signup if the character has cleared the encounter so it can be used for further processing
   */
  private processSignup(signup: SignupDocument, guildId: string) {
    this.logger.log(`Checking signup for ${signup.character}`);
    Sentry.getCurrentScope().setExtra('signup', signup);

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
            this.logger.log(`Character ${character} has cleared ${encounter}.`);

            await this.removeSignup(signup, guildId);
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

  private async removeSignup(signup: SignupDocument, guildId: string) {
    if (this.config.CLEAR_CHECKER_MODE === 'report') return;

    const settings = await this.settingsCollection.getSettings(guildId);

    this.logger.log('checking spreadsheet...');
    if (settings?.spreadsheetId) {
      await this.sheetsService.removeSignup(signup, settings.spreadsheetId);
    }

    this.logger.log('spreadsheet check complete');
    this.logger.log('checking for existing review message...');

    if (settings?.reviewChannel && signup.reviewMessageId) {
      await this.discordService
        .deleteMessage(guildId, settings.reviewChannel, signup.reviewMessageId)
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

  private async publishResults(results: SignupDocument[], guildId: string) {
    if (results.length === 0) return;

    const fields = Object.entries(
      Object.groupBy(results, (item) => item.encounter),
    ).map(([encounter, signups]) => {
      const value = signups
        .map((signup) => `${signup.character} <@${signup.discordId}>`)
        .join('\n');
      return {
        name: EncounterFriendlyDescription[encounter as Encounter],
        value: `${titleCase(value)}`,
      };
    });

    const description = this.getDescription();

    const embed = new EmbedBuilder()
      .setTitle(':broom: Clear Check :broom:')
      .setDescription(description)
      .addFields(fields)
      .setTimestamp();

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

  private getDescription() {
    const mode = this.config.CLEAR_CHECKER_MODE;

    if (mode === 'report') {
      return 'The following signups have been flagged for having cleared. Please review and remove them manually.';
    }

    return 'The following signups have been removed for having cleared the fight';
  }
}

export { ClearCheckerJob };
