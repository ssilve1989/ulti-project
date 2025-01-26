import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
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
  tap,
  toArray,
} from 'rxjs';
import { CronTime } from '../../common/cron.js';
import { DiscordService } from '../../discord/discord.service.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../../firebase/models/signup.model.js';
import { sentryReport } from '../../sentry/sentry.consts.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { RemoveSignupEvent } from '../../slash-commands/signup/subcommands/remove-signup/remove-signup.events.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';
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
    private readonly eventBus: EventBus,
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
    return from(this.signupsCollection.findAll({})).pipe(
      mergeMap((signups) => signups),
      mergeMap(
        (signup, index) => this.processSignup(signup, index),
        this.config.CLEAR_CHECKER_CONCURRENCY,
      ),
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
    index: number,
  ): Promise<SignupDocument | undefined> {
    if (!this.checkableEncounters.has(signup.encounter)) return;

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
      await this.sheetsService.batchRemoveClearedSignups(signups, {
        // TODO: need to provide encounter, hard-assigning here it doesn't scale well
        encounter: Encounter.FRU,
        spreadsheetId: settings.spreadsheetId,
        partyTypes: [PartyStatus.ClearParty, PartyStatus.ProgParty],
      });
    }

    for (const signup of signups) {
      if (settings?.reviewChannel && signup.reviewMessageId) {
        await this.discordService
          .deleteMessage(
            guildId,
            settings.reviewChannel,
            signup.reviewMessageId,
          )
          .catch((err) => {
            sentryReport(err);
          });
      }

      await this.signupsCollection
        .removeSignup({
          character: signup.character,
          world: signup.world,
          encounter: signup.encounter,
        })
        .catch((err) => {
          this.logger.warn(`error removing signup for ${signup.character}`);
          sentryReport(err);
        });

      this.logger.log(`signup removal complete for ${signup.character}`);
    }
  }

  private async publishResults(results: SignupDocument[], guildId: string) {
    if (results.length === 0) return;

    const settings = await this.settingsCollection.getSettings(guildId);

    if (!settings?.modChannelId) {
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(':broom: Clear Checker :broom:')
      .setDescription(`${results.length} players have been removed!`)
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
