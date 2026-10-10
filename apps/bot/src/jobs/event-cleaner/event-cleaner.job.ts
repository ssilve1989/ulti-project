import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { CronJob } from 'cron';
import { CronTime } from '../../common/cron.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { createJob } from '../jobs.consts.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Runs daily: deletes each event a week after it starts, with its sign-ups and rosters. */
@Injectable()
export class EventCleanerJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly job: CronJob<null, null>;
  private readonly logger = new Logger(EventCleanerJob.name);

  constructor(private readonly events: EventsCollection) {
    this.job = createJob('event-cleaner', {
      cronTime: CronTime.everyDay().at(4), // 4 AM Pacific
      // Rethrow after logging so the Sentry cron monitor records the failure
      onTick: async () => {
        try {
          await this.clean(new Date());
        } catch (error) {
          this.logger.error(error, 'event-cleaner job failed');
          throw error;
        }
      },
    });
  }

  onApplicationBootstrap() {
    this.job.start();
  }

  async onApplicationShutdown() {
    await this.job.stop();
  }

  /** A failed delete fails the run; tomorrow's run picks the event up again. */
  private async clean(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - WEEK_MS);
    for (const event of await this.events.findStartedBy(cutoff)) {
      await this.events.purge(event.id);
    }
  }
}
