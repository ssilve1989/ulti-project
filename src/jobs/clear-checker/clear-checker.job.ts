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
  filter,
  firstValueFrom,
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
import { createJob } from '../jobs.consts.js';
import { clearCheckerConfig } from './clear-checker.config.js';

@Injectable()
class ClearCheckerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  // TODO: checkable encounters should be a job config thats stored in the DB probably
  private readonly checkableEncounters = new Set([Encounter.FRU]);
  private readonly logger = new Logger(ClearCheckerJob.name);
  private readonly job: CronJob;

  constructor(
    private readonly discordService: DiscordService,
    private readonly fflogsService: FFLogsService,
    private readonly jobCollection: JobCollection,
    private readonly settingsCollection: SettingsCollection,
    private readonly sheetsService: SheetsService,
    private readonly signupsCollection: SignupCollection,
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
    console.log('processing', guildId);
    return from(this.signupsCollection.findAll({})).pipe(
      mergeMap((signups) => {
        this.logger.debug(`Checking ${signups.length} signups`);
        return signups;
      }),
      mergeMap(async (signup) => {
        const res = await this.processSignup(signup, guildId);
        console.log('res', res);
        return res;
      }, this.config.CLEAR_CHECKER_CONCURRENCY),
      filter((signup) => !!signup),
      toArray(),
      mergeMap((results) => {
        console.log(results);
        return this.publishResults(results, guildId);
      }),
    );
  }

  /**
   * processes the signup to check if the character has cleared the given encounter
   * @param signup
   * @returns the signup if the character has cleared the encounter so it can be used for further processing
   */
  private async processSignup(
    signup: SignupDocument,
    guildId: string,
  ): Promise<SignupDocument | undefined> {
    if (!this.checkableEncounters.has(signup.encounter)) return;

    Sentry.getCurrentScope().setExtra('signup', signup);
    this.logger.debug(`Checking signup for ${signup.character}`);

    const { encounter, character, world } = signup;

    try {
      const hasCleared = await firstValueFrom(
        this.fflogsService.hasClearedEncounter(encounter, {
          name: character,
          server: world,
          region: 'NA',
        }),
      );

      if (!hasCleared) return;

      await this.removeSignup(signup, guildId);
      return signup;
    } catch (e) {
      sentryReport(e);
      this.logger.warn(`Error checking signup for ${signup.character}`);
    }
  }

  private async removeSignup(signup: SignupDocument, guildId: string) {
    const settings = await this.settingsCollection.getSettings(guildId);

    this.logger.debug('checking spreadsheet...');
    if (settings?.spreadsheetId) {
      await this.sheetsService.removeSignup(signup, settings.spreadsheetId);
    }

    this.logger.debug('spreadsheet check complete');
    this.logger.debug('checking for existing review message...');

    if (settings?.reviewChannel && signup.reviewMessageId) {
      await this.discordService
        .deleteMessage(guildId, settings.reviewChannel, signup.reviewMessageId)
        .catch((err) => {
          sentryReport(err);
        });
    }

    this.logger.debug('review message check complete');
    this.logger.debug('checking document collection...');

    await this.signupsCollection.removeSignup({
      character: signup.character,
      world: signup.world,
      encounter: signup.encounter,
    });

    this.logger.log(`signup removal complete for ${signup.character}`);
  }

  private async publishResults(results: SignupDocument[], guildId: string) {
    console.log(results);
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
    return 'The following signups have been removed for having cleared the fight';
  }
}

export { ClearCheckerJob };
