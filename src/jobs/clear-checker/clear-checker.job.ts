import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { CronJob } from 'cron';
import { EmbedBuilder } from 'discord.js';
import {
  catchError,
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
import { clearCheckerConfig } from '../../config/clear-checker.js';
import { DiscordService } from '../../discord/discord.service.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { ErrorService } from '../../error/error.service.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../../firebase/models/signup.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { RemoveSignupEvent } from '../../slash-commands/remove-signup/remove-signup.events.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';

// Discord caps an embed field value at 1024 characters. Overflowing it rejects
// the whole message, which would swallow the entire summary rather than just
// the tail of this list.
const EMBED_FIELD_LIMIT = 1024;

const SHEET_FAILURE_FIELD_NAME =
  ':warning: Could not be removed from the spreadsheet';

const SHEET_FAILURE_PREAMBLE =
  'These were removed from the database, but their spreadsheet rows remain and need manual cleanup:\n';

const overflowMarker = (count: number) => `\n…and ${count} more`;

/**
 * Renders the signups whose spreadsheet rows could not be removed, truncated to
 * fit inside a single embed field.
 */
function formatSheetFailures(signups: SignupDocument[]): string {
  const lines = signups.map(
    ({ character, world, encounter }) =>
      `${character} (${world}) — ${encounter}`,
  );

  const full = SHEET_FAILURE_PREAMBLE + lines.join('\n');

  if (full.length <= EMBED_FIELD_LIMIT) return full;

  // Reserve the widest marker the list could produce, so the result is under
  // the limit no matter how many entries end up being dropped.
  const reserved = overflowMarker(signups.length).length;
  const kept: string[] = [];
  let length = SHEET_FAILURE_PREAMBLE.length;

  for (const line of lines) {
    if (length + line.length + 1 + reserved > EMBED_FIELD_LIMIT) break;
    kept.push(line);
    length += line.length + 1;
  }

  return (
    SHEET_FAILURE_PREAMBLE +
    kept.join('\n') +
    overflowMarker(lines.length - kept.length)
  );
}

@Injectable()
class ClearCheckerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ClearCheckerJob.name);
  private readonly job: CronJob;

  constructor(
    private readonly discordService: DiscordService,
    private readonly errorService: ErrorService,
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
        this.checkClears().catch((e) =>
          this.errorService.captureError(e, {
            message: 'clear-checker job failed',
          }),
        );
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
      // contain a failure to the guild that caused it - without this, one
      // guild's error tears down the shared stream and silently skips the rest
      mergeMap((guildId) =>
        this.processGuild(guildId).pipe(
          catchError((error: unknown) => {
            this.errorService.captureError(error, {
              message: `clear-checker failed for guild ${guildId}`,
            });
            return EMPTY;
          }),
        ),
      ),
    );

    return lastValueFrom(task$, { defaultValue: undefined });
  }

  private processGuild(guildId: string) {
    return forkJoin({
      signups: this.signupsCollection.findAll(guildId, {}),
      encounters: this.encountersCollection.getActiveEncounters(guildId),
    }).pipe(
      mergeMap(({ signups, encounters }) => {
        const encounterIds = new Set<Encounter>(
          encounters.map((encounter) => encounter.id as Encounter),
        );

        return from(signups).pipe(
          mergeMap(
            (signup, index) => this.processSignup(signup, encounterIds, index),
            clearCheckerConfig.CLEAR_CHECKER_CONCURRENCY,
          ),
        );
      }),
      filter((signup) => !!signup),
      toArray(),
      mergeMap(async (results) => {
        const sheetFailures = await this.removeSignups(results, guildId);
        await this.publishResults(results, guildId, sheetFailures);
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
      this.errorService.captureError(e, {
        message: `error checking signup for ${signup.character}`,
      });
    }

    return undefined;
  }

  /**
   * Removes the given signups from the spreadsheet, Discord and the database.
   *
   * Firestore is the system of record and the spreadsheet is a denormalized
   * read-mirror, so a failed sheet removal must not block the authoritative
   * delete - the googleapis client has already exhausted its own retries by the
   * time we see the error. The affected signups are returned so the summary can
   * name the rows that were left behind for manual cleanup.
   *
   * @returns the signups whose spreadsheet rows could not be removed
   */
  private async removeSignups(signups: SignupDocument[], guildId: string) {
    this.logger.log(`removing ${signups.length} signups`);

    const settings = await this.settingsCollection.getSettings(guildId);
    const sheetFailures: SignupDocument[] = [];

    if (settings?.spreadsheetId) {
      // Group signups by encounter since each call to batchRemoveClearedSignups handles one encounter
      const signupsByEncounter = Map.groupBy(
        signups,
        (signup) => signup.encounter,
      );

      // Process each encounter group separately
      for (const [encounter, encounterSignups] of signupsByEncounter) {
        try {
          await this.sheetsService.batchRemoveClearedSignups(encounterSignups, {
            encounter,
            spreadsheetId: settings.spreadsheetId,
            partyTypes: [PartyStatus.ClearParty, PartyStatus.ProgParty],
          });
        } catch (error: unknown) {
          this.logger.error(
            `failed to remove ${encounterSignups.length} cleared signups from the ${encounter} spreadsheet`,
            error,
          );
          sheetFailures.push(...encounterSignups);
        }
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
        this.removeSignupFromDatabase(guildId, signup),
      ]);

      this.logger.log(
        `successfully removed signup ${signup.character} - ${signup.encounter}`,
      );
    }

    return sheetFailures;
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
        this.errorService.captureError(err, {
          message: `error removing signup for ${character}`,
        });
      });
  }

  private removeSignupFromDatabase(guildId: string, signup: SignupDocument) {
    return this.signupsCollection
      .removeSignup(guildId, {
        character: signup.character,
        world: signup.world,
        encounter: signup.encounter,
      })
      .catch((err) => {
        this.errorService.captureError(err, {
          message: `error removing signup for ${signup.character}`,
        });
      });
  }

  private async publishResults(
    results: SignupDocument[],
    guildId: string,
    sheetFailures: SignupDocument[],
  ) {
    // sheetFailures is a subset of results, so it cannot be non-empty here
    if (results.length === 0) return;

    const settings = await this.settingsCollection.getSettings(guildId);

    if (!settings?.autoModChannelId) {
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(':broom: Clear Checker :broom:')
      .setDescription(`${results.length} signups have been removed!`)
      .setTimestamp();

    if (sheetFailures.length > 0) {
      embed.addFields({
        name: SHEET_FAILURE_FIELD_NAME,
        value: formatSheetFailures(sheetFailures),
      });
    }

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: settings.autoModChannelId,
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
