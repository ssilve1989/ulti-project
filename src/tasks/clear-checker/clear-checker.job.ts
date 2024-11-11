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
  defer,
  filter,
  lastValueFrom,
  mergeMap,
  toArray,
} from 'rxjs';
import { titleCase } from 'title-case';
import { DiscordService } from '../../discord/discord.service.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../encounters/encounters.consts.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { type SignupDocument } from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { createJob } from '../tasks.consts.js';
import { clearCheckerConfig } from './clear-checker.config.js';

@Injectable()
class ClearCheckerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  // We don't want this job to run in every guild because thats not really necessary
  // so we need some way of identifying which guild the bots in that we want this to run
  // for now we'll just hardcode the guildId
  private static readonly guildId = '808585230759755817';
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
    private readonly fflogsService: FFLogsService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupsCollection: SignupCollection,
    private readonly sheetsService: SheetsService,
    @Inject(clearCheckerConfig.KEY)
    private readonly config: ConfigType<typeof clearCheckerConfig>,
  ) {
    this.job = createJob('clear-checker-cron', '1 * * * * *', () => {
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

    const task$ = defer(() => this.signupsCollection.findAll({})).pipe(
      mergeMap((signups) => {
        this.logger.log(`Checking ${signups.length} signups`);
        return signups;
      }),
      mergeMap(
        (signup) =>
          this.checkableEncounters.has(signup.encounter)
            ? this.processSignup(signup)
            : EMPTY,
        this.config.CLEAR_CHECKER_CONCURRENCY,
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
            this.logger.log(`Character ${character} has cleared ${encounter}.`);

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
    if (this.config.CLEAR_CHECKER_MODE === 'report') return;

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

    const settings = await this.settingsCollection.getSettings(
      ClearCheckerJob.guildId,
    );

    if (!settings?.modChannelId) {
      return;
    }

    const channel = await this.discordService.getTextChannel({
      guildId: ClearCheckerJob.guildId,
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
