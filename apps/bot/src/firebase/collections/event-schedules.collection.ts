import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { typedCollection } from '@ulti-project/shared';
import {
  type CollectionReference,
  Firestore,
  type QuerySnapshot,
  Timestamp,
} from 'firebase-admin/firestore';
import {
  nextOccurrence,
  type Recurrence,
} from '../../events/schedules/next-occurrence.js';
import { InjectFirestore } from '../firebase.decorators.js';
import type {
  EventScheduleDocument,
  ScheduleSettings,
  StoredSchedule,
} from '../models/event-schedule.model.js';

const MILLISECONDS_PER_HOUR = 3_600_000;

type UntimedSchedule = Omit<
  EventScheduleDocument,
  'nextStartAt' | 'nextPostAt'
>;

/** The first occurrence strictly after `after`, and when to post it. */
function scheduleTimes(
  settings: Recurrence & Pick<ScheduleSettings, 'postLeadHours'>,
  after: Date,
) {
  const start = nextOccurrence(settings, after);
  return {
    nextStartAt: Timestamp.fromDate(start),
    nextPostAt: Timestamp.fromMillis(
      start.getTime() - settings.postLeadHours * MILLISECONDS_PER_HOUR,
    ),
  };
}

/** `schedule` with its times from `after`; a paused one gets no `nextPostAt`. */
function timed(schedule: UntimedSchedule, after: Date): EventScheduleDocument {
  const { nextStartAt, nextPostAt } = scheduleTimes(schedule, after);
  return schedule.paused
    ? { ...schedule, nextStartAt }
    : { ...schedule, nextStartAt, nextPostAt };
}

@Injectable()
class EventSchedulesCollection {
  private readonly schedules: CollectionReference<EventScheduleDocument>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.schedules = typedCollection<EventScheduleDocument>(
      this.firestore,
      'event-schedules',
    );
  }

  @SentryTraced()
  public async create(
    guildId: string,
    settings: ScheduleSettings,
    by: string,
    now: Date,
  ): Promise<StoredSchedule> {
    const ref = this.schedules.doc();
    const document = timed(
      { ...settings, guildId, paused: false, createdBy: by, updatedBy: by },
      now,
    );
    await ref.create(document);
    return { ...document, id: ref.id };
  }

  /** Applies `changes` and recomputes the times from `now`; undefined if missing. */
  @SentryTraced()
  public update(
    id: string,
    changes: Partial<ScheduleSettings>,
    by: string,
    now: Date,
  ): Promise<StoredSchedule | undefined> {
    return this.rewrite(id, (schedule) =>
      timed({ ...schedule, ...changes, updatedBy: by }, now),
    );
  }

  /**
   * Pausing keeps `nextStartAt` and removes `nextPostAt`; resuming recomputes
   * both from `now`, so occurrences missed while paused aren't posted.
   */
  @SentryTraced()
  public setPaused(
    id: string,
    paused: boolean,
    now: Date,
  ): Promise<StoredSchedule | undefined> {
    return this.rewrite(id, (schedule, { nextStartAt }) =>
      paused
        ? { ...schedule, paused, nextStartAt }
        : timed({ ...schedule, paused }, now),
    );
  }

  /** Whether the schedule existed. */
  @SentryTraced()
  public delete(id: string): Promise<boolean> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.schedules.doc(id);
      const exists = (await tx.get(ref)).exists;
      if (exists) tx.delete(ref);
      return exists;
    });
  }

  @SentryTraced()
  public async listForGuild(guildId: string): Promise<StoredSchedule[]> {
    const snapshot = await this.schedules.where('guildId', '==', guildId).get();
    return EventSchedulesCollection.stored(snapshot);
  }

  /** Unpaused schedules at or past their post time. */
  @SentryTraced()
  public async findDue(now: Date): Promise<StoredSchedule[]> {
    const snapshot = await this.schedules
      .where('nextPostAt', '<=', Timestamp.fromDate(now))
      .get();
    return EventSchedulesCollection.stored(snapshot);
  }

  /** Moves the schedule to its first occurrence after `after`. */
  @SentryTraced()
  public async advance(id: string, after: Date): Promise<void> {
    await this.rewrite(id, (schedule) => timed(schedule, after));
  }

  private static stored(snapshot: QuerySnapshot<EventScheduleDocument>) {
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  /**
   * Replaces the schedule with `change(schedule without its times, current)`,
   * rewriting the whole document so a dropped `nextPostAt` is removed.
   */
  private rewrite(
    id: string,
    change: (
      schedule: UntimedSchedule,
      current: EventScheduleDocument,
    ) => EventScheduleDocument,
  ): Promise<StoredSchedule | undefined> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.schedules.doc(id);
      const current = (await tx.get(ref)).data();
      if (!current) return undefined;
      const { nextStartAt: _start, nextPostAt: _post, ...schedule } = current;
      const next = change(schedule, current);
      tx.set(ref, next);
      return { ...next, id };
    });
  }
}

export { EventSchedulesCollection };
