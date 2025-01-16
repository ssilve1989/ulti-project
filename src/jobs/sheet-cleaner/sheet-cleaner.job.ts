import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { CronJob } from 'cron';
import { filter, from, lastValueFrom, mergeMap } from 'rxjs';
import { CronTime } from '../../common/cron.js';
import { DiscordService } from '../../discord/discord.service.js';
import { Encounter } from '../../encounters/encounters.consts.js';
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
  ) {
    this.job = createJob('sheet-cleaner', {
      cronTime: CronTime.everyDay().at(3),
      runOnInit: true,
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

  private async cleanSheet() {
    this.logger.log('starting sheet cleaner job');

    const guilds = this.discordService.getGuilds();

    const task$ = from(guilds).pipe(
      mergeMap((guild) =>
        this.jobsCollection
          .getJob(guild, 'sheet-cleaner')
          .then((job) => [guild, job] as const),
      ),
      filter(([_, job]) => !!job?.enabled),
      mergeMap(async ([guild]) => {
        const settings = await this.settingsCollection.getSettings(guild);

        if (!settings?.spreadsheetId) return;

        return this.sheetsService.cleanSheet({
          spreadsheetId: settings.spreadsheetId,
          encounter: Encounter.FRU,
        });
      }),
    );

    return lastValueFrom(task$, { defaultValue: undefined });
  }
}

export { SheetCleanerJob };
