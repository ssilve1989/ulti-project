import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  type Encounter,
  EncounterFriendlyDescription,
} from '@ulti-project/shared';
import { channelMention } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { DiscordService } from '../../discord/discord.service.js';
import { ErrorService } from '../../error/error.service.js';
import { EventSchedulesCollection } from '../../firebase/collections/event-schedules.collection.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import {
  EventStatus,
  type ParticipantDocument,
  type StoredEvent,
} from '../../firebase/models/event.model.js';
import type {
  ScheduleSettings,
  StoredSchedule,
} from '../../firebase/models/event-schedule.model.js';
import { EventMessageService } from '../event-message.service.js';
import { ParticipantWithdrawnEvent } from '../signup/events.events.js';
import {
  firstFreeOccurrence,
  occurrenceOnDayOf,
  type Recurrence,
  signupsCloseAt,
} from './next-occurrence.js';

export interface PostedEventsUpdate {
  schedule: StoredSchedule;
  /** How many posted events were updated */
  updated: number;
  /** Sign-ups deleted because their encounter was removed */
  removed: Partial<Record<Encounter, number>>;
  /** Events that stayed in their old channel because posting in the new one failed */
  notMoved: number;
}

/** `Updated 1 posted event (2 sign-ups removed from TOP).`; undefined if none was. */
export function postedEventsSummary({
  schedule,
  updated,
  removed,
  notMoved,
}: PostedEventsUpdate): string | undefined {
  if (updated === 0) return undefined;
  const encounters = Object.keys(removed);
  const removedCount = Object.values(removed).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const removals = removedCount
    ? ` (${plural(removedCount, 'sign-up')} removed from ${encounters.join(', ')})`
    : '';
  const unmoved = notMoved
    ? `; ${notMoved} couldn't be moved to ${channelMention(schedule.channelId)}`
    : '';
  return `Updated ${plural(updated, 'posted event')}${removals}${unmoved}.`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Each posted event's new start, in `posted`'s (start) order. An event whose
 * weekday, read in the schedule's zone `before` the edit, is still scheduled
 * stays on that date at the new time; one whose weekday was removed, or whose
 * new time that day has passed, takes the earliest occurrence after `now`
 * that no other event of the schedule holds (`held`: those not being moved).
 */
function newStarts(
  posted: readonly StoredEvent[],
  before: Recurrence,
  after: Recurrence,
  held: readonly number[],
  now: Date,
): Date[] {
  const kept = posted.map((event) => {
    const start = occurrenceOnDayOf(
      after,
      event.startsAt.toDate(),
      before.timeZone,
    );
    return start && start > now ? start : undefined;
  });
  const taken = new Set([
    ...held,
    ...kept.flatMap((start) => start?.getTime() ?? []),
  ]);
  return kept.map((start) => {
    if (start) return start;
    const next = firstFreeOccurrence(after, now, taken);
    taken.add(next.getTime());
    return next;
  });
}

/** Applies a schedule's edits to the events it already posted. */
@Injectable()
export class PostedEventsUpdater {
  private readonly logger = new Logger(PostedEventsUpdater.name);

  constructor(
    private readonly events: EventsCollection,
    private readonly schedules: EventSchedulesCollection,
    private readonly messages: EventMessageService,
    private readonly discord: DiscordService,
    private readonly eventBus: EventBus,
    private readonly errors: ErrorService,
  ) {}

  /**
   * Saves `changes` to the schedule, then updates the events it posted that
   * haven't started and aren't closed, each keeping its own day when it can
   * (`newStarts`). The schedule's next times skip every start its future
   * events hold. Undefined, touching no event, if the schedule is missing.
   */
  async apply(
    scheduleId: string,
    changes: Partial<ScheduleSettings>,
    by: string,
    now: Date,
  ): Promise<PostedEventsUpdate | undefined> {
    const future = await this.events.findFutureForSchedule(scheduleId, now);
    const posted = future.filter(({ status }) => status !== EventStatus.Closed);
    // a closed event still holds its start
    const closed = future
      .filter(({ status }) => status === EventStatus.Closed)
      .map(({ startsAt }) => startsAt.toMillis());
    let starts: Date[] = [];
    const schedule = await this.schedules.update(
      scheduleId,
      changes,
      by,
      now,
      (before, after) => {
        // recomputed if the transaction retries, so the last run's starts win
        starts = newStarts(posted, before, after, closed, now);
        return new Set([...closed, ...starts.map((start) => start.getTime())]);
      },
    );
    if (!schedule) return undefined;

    const update: PostedEventsUpdate = {
      schedule,
      updated: 0,
      removed: {},
      notMoved: 0,
    };
    for (const [index, event] of posted.entries()) {
      const outcome = await this.updateEvent(
        event,
        schedule,
        starts[index],
        now,
      );
      if (!outcome) continue;
      update.updated++;
      for (const { encounter } of outcome.removed) {
        update.removed[encounter] = (update.removed[encounter] ?? 0) + 1;
      }
      if (!outcome.moved) update.notMoved++;
    }
    return update;
  }

  /** Undefined if the event closed or was deleted since it was found. */
  private async updateEvent(
    event: StoredEvent,
    schedule: StoredSchedule,
    startsAt: Date,
    now: Date,
  ): Promise<{ removed: ParticipantDocument[]; moved: boolean } | undefined> {
    const updated = await this.events.reschedule(
      event.id,
      {
        title: schedule.title,
        encounters: schedule.encounters,
        startsAt: Timestamp.fromDate(startsAt),
        signupsCloseAt: Timestamp.fromDate(signupsCloseAt(schedule, startsAt)),
      },
      now,
    );
    if (!updated) return undefined;

    const removed = await this.removeDroppedSignups(updated);
    const stays = updated.channelId === schedule.channelId;
    const moved = !stays && (await this.moveTo(updated, schedule.channelId));
    // a moved event was posted as it is now; one that wasn't is re-rendered
    if (!moved) {
      await this.messages.refresh(updated.id).catch((error: unknown) =>
        this.errors.captureError(error, {
          message: `Failed to refresh event ${updated.id} after its schedule was edited`,
        }),
      );
    }
    return { removed, moved: stays || moved };
  }

  /** Deletes the sign-ups for encounters the event no longer has, telling each member and the board. */
  private async removeDroppedSignups(
    event: StoredEvent,
  ): Promise<ParticipantDocument[]> {
    const dropped = (await this.events.listParticipants(event.id)).filter(
      (participant) => !event.encounters.includes(participant.encounter),
    );
    const removed: ParticipantDocument[] = [];
    for (const { discordId, encounter } of dropped) {
      const id = EventsCollection.participantId(discordId, encounter);
      const participant = await this.events.removeParticipant(event.id, id);
      // they withdrew meanwhile
      if (!participant) continue;
      removed.push(participant);
      this.eventBus.publish(
        new ParticipantWithdrawnEvent(
          event.id,
          { ...participant, id },
          'encounter-removed',
        ),
      );
      await this.tellRemoved(participant, event);
    }
    return removed;
  }

  /** DMs the member; one whose DMs are closed is only logged. */
  private async tellRemoved(
    { discordId, encounter }: ParticipantDocument,
    event: StoredEvent,
  ): Promise<void> {
    try {
      await this.discord.sendDirectMessage(
        discordId,
        `**${EncounterFriendlyDescription[encounter]}** was removed from **${event.title}**, so your sign-up for it was cancelled.`,
      );
    } catch (error) {
      this.logger.warn(
        `Could not tell ${discordId} their ${encounter} sign-up for event ${event.id} was cancelled: ${String(error)}`,
      );
    }
  }

  /** Whether the event moved; a failure is reported and leaves it where it was. */
  private async moveTo(
    event: StoredEvent,
    channelId: string,
  ): Promise<boolean> {
    try {
      await this.messages.move(event, channelId);
      return true;
    } catch (error) {
      this.errors.captureError(error, {
        message: `event ${event.id} could not be moved to channel ${channelId}`,
      });
      return false;
    }
  }
}
