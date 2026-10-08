import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { CronJob } from 'cron';
import { Timestamp } from 'firebase-admin/firestore';
import { ErrorService } from '../../error/error.service.js';
import { EventMessageService } from '../../events/event-message.service.js';
import { EventSchedulesCollection } from '../../firebase/collections/event-schedules.collection.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import type { StoredSchedule } from '../../firebase/models/event-schedule.model.js';
import { createJob } from '../jobs.consts.js';

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * Runs every minute: closes sign-ups that are due and re-renders those events,
 * then posts the occurrences that schedules are due to post.
 */
@Injectable()
export class EventSchedulerJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly job: CronJob<null, null>;
  private readonly logger = new Logger(EventSchedulerJob.name);

  constructor(
    private readonly events: EventsCollection,
    private readonly messages: EventMessageService,
    private readonly schedules: EventSchedulesCollection,
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
   * Closes every event's sign-ups that are due by `now` and re-renders it,
   * then posts every schedule's due occurrence. One event or schedule failing
   * is reported and doesn't stop the rest; only a failed query fails the tick.
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

    for (const schedule of await this.schedules.findDue(now)) {
      try {
        await this.postOccurrence(schedule, now);
      } catch (error) {
        this.errors.captureError(error, {
          message: `schedule ${schedule.id} could not be handled`,
        });
      }
    }
  }

  /**
   * Posts the schedule's next occurrence and moves it on; a missed one is only
   * moved on. If the event can't be created the schedule stays put, so the
   * next tick retries it while its start is still ahead.
   */
  private async postOccurrence(
    schedule: StoredSchedule,
    now: Date,
  ): Promise<void> {
    const startsAt = schedule.nextStartAt.toDate();
    if (startsAt <= now) {
      this.logger.warn(
        `schedule ${schedule.id} missed the occurrence at ${startsAt.toISOString()}; skipping`,
      );
      await this.schedules.advance(schedule.id, startsAt);
      return;
    }
    // Keyed by schedule and start, and posted only once it has no message,
    // so a tick that re-runs after a crash can't post the occurrence twice
    const id = `${schedule.id}-${Math.floor(startsAt.getTime() / 1000)}`;
    const event = await this.events.createIfAbsent(id, {
      guildId: schedule.guildId,
      title: schedule.title,
      encounters: schedule.encounters,
      channelId: schedule.channelId,
      createdBy: schedule.createdBy,
      scheduleId: schedule.id,
      startsAt: Timestamp.fromDate(startsAt),
      signupsCloseAt: Timestamp.fromMillis(
        startsAt.getTime() -
          schedule.signupsCloseBeforeHours * MILLISECONDS_PER_HOUR,
      ),
    });
    try {
      if (!event.messageId) await this.messages.post(event);
    } catch (error) {
      this.errors.captureError(error, {
        message: `schedule ${schedule.id} could not post ${id}`,
      });
      await this.discard(id);
    }
    // Advance even after a failed post, so a deleted channel or a missing
    // permission doesn't fail every minute
    await this.schedules.advance(schedule.id, startsAt);
  }

  /** Deletes an event that couldn't be posted, so no unposted event stays open. */
  private async discard(id: string): Promise<void> {
    try {
      await this.events.delete(id);
    } catch (error) {
      this.errors.captureError(error, {
        message: `could not delete unposted event ${id}`,
      });
    }
  }
}
