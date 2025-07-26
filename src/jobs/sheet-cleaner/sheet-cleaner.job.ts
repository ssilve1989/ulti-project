import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { CronJob } from 'cron';
import {
  concatMap,
  EMPTY,
  filter,
  finalize,
  from,
  lastValueFrom,
  mergeMap,
} from 'rxjs';
import { CronTime } from '../../common/cron.js';
import { DiscordService } from '../../discord/discord.service.js';
import type { Encounter } from '../../encounters/encounters.consts.js';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { JobCollection } from '../../firebase/collections/job/job.collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { createJob, jobDateFormatter } from '../jobs.consts.js';

// TODO: Jobs share a commonality for checking the job collection
// for if they should run, this should be abstracted
@Injectable()
class SheetCleanerJob implements OnApplicationBootstrap, OnApplicationShutdown {
  protected job: CronJob<null, null>;
  private readonly logger = new Logger(SheetCleanerJob.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly jobsCollection: JobCollection,
    private readonly sheetsService: SheetsService,
    private readonly settingsCollection: SettingsCollection,
    private readonly encountersCollection: EncountersCollection,
  ) {
    this.job = createJob('sheet-cleaner', {
      cronTime: CronTime.everyDay().at(4),
      onTick: () => {
        this.cleanSheet();
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

  private cleanSheet() {
    this.logger.log('starting sheet cleaner job');

    const guilds = this.discordService.getGuilds();

    const task$ = from(guilds).pipe(
      mergeMap((guild) =>
        this.jobsCollection
          .getJob(guild, 'sheet-cleaner')
          .then((job) => [guild, job] as const),
      ),
      filter(([_, job]) => !!job?.enabled),
      mergeMap(([guild]) => {
        return from(this.settingsCollection.getSettings(guild)).pipe(
          mergeMap((settings) => {
            if (!settings?.spreadsheetId) return EMPTY;

            const spreadsheetId = settings.spreadsheetId;

            // NOTE: This uses the active encounters from the database
            // but nothing else uses that right now. Encounters in the signup slash command
            // are still hardcoded. They ideally should be managed dynamically as well, but require runtime
            // changes to update the slash command.
            return from(this.encountersCollection.getActiveEncounters()).pipe(
              mergeMap((encounters) => encounters),
              concatMap((encounter) =>
                this.sheetsService
                  .cleanSheet({
                    spreadsheetId,
                    encounter: encounter.id as Encounter,
                  })
                  .catch((err) => {
                    Sentry.captureException(err);
                    return EMPTY;
                  }),
              ),
            );
          }),
        );
      }),
      finalize(() => {
        this.logger.log('sheet cleaner job completed');
      }),
    );

    return lastValueFrom(task$, { defaultValue: undefined });
  }
}

export { SheetCleanerJob };
