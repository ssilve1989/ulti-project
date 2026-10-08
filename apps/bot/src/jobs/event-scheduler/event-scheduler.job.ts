import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { CronJob } from 'cron';
import { ErrorService } from '../../error/error.service.js';
import { EventMessageService } from '../../events/event-message.service.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { createJob } from '../jobs.consts.js';

/** Runs every minute: closes sign-ups that are due and re-renders those events. */
@Injectable()
export class EventSchedulerJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly job: CronJob<null, null>;
  private readonly logger = new Logger(EventSchedulerJob.name);

  constructor(
    private readonly events: EventsCollection,
    private readonly messages: EventMessageService,
    private readonly errors: ErrorService,
  ) {
    this.job = createJob('event-scheduler', {
      cronTime: '* * * * *',
      // Rethrow after logging so the Sentry cron monitor records the failure
      onTick: async () => {
        try {
          await this.tick(new Date());
        } catch (error) {
          this.logger.error(error, 'event-scheduler tick failed');
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

  /**
   * Closes every event's sign-ups that are due by `now` and re-renders it.
   * One event failing is reported and doesn't stop the rest; only a failed
   * query fails the tick.
   */
  async tick(now: Date): Promise<void> {
    for (const due of await this.events.findDueToCloseSignups(now)) {
      try {
        const closed = await this.events.closeSignups(due.id);
        if (closed) await this.messages.refresh(closed.id);
      } catch (error) {
        this.errors.captureError(error, {
          message: `Failed to close sign-ups for event ${due.id}`,
        });
      }
    }
  }
}
