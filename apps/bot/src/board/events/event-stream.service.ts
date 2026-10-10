import { Injectable } from '@nestjs/common';
import type { BoardStreamMessage } from '@ulti-project/shared';
import { concatMap, finalize, merge, type Observable, of, share } from 'rxjs';
import {
  type EventChange,
  EventChangesBus,
} from '../../events/event-changes.bus.js';
import { notFound } from '../../http/http-exception.filter.js';
import { BoardEventReader } from './board-event.reader.js';

/** What an open board hears about an event: its snapshot, then each change. */
@Injectable()
export class EventStreamService {
  /** Each watched event's changes, read once however many boards have it open. */
  private readonly watched = new Map<string, Observable<BoardStreamMessage>>();

  constructor(
    private readonly bus: EventChangesBus,
    private readonly reader: BoardEventReader,
  ) {}

  /**
   * The event's snapshot, then its changes as the board shows them. It
   * subscribes to the changes before reading the snapshot, so one that lands
   * while the snapshot loads follows it instead of being lost. Each change is
   * read in turn, so a slow read is never overtaken by a later change. Fails
   * with 404 not-found if the event is missing or another guild's.
   */
  stream(guildId: string, eventId: string): Observable<BoardStreamMessage> {
    return merge(this.changes(guildId, eventId), of(undefined)).pipe(
      concatMap(
        async (message) =>
          message ?? this.resolve(guildId, { kind: 'event', eventId }),
      ),
    );
  }

  /** The event's changes as the board shows them, shared by its open streams. */
  private changes(
    guildId: string,
    eventId: string,
  ): Observable<BoardStreamMessage> {
    const key = `${guildId}/${eventId}`;
    let changes = this.watched.get(key);
    if (changes === undefined) {
      changes = this.bus.changes(eventId).pipe(
        concatMap((change) => this.resolve(guildId, change)),
        // the last stream closed or a read failed: the next one starts afresh
        finalize(() => this.watched.delete(key)),
        share(),
      );
      this.watched.set(key, changes);
    }
    return changes;
  }

  private async resolve(
    guildId: string,
    change: EventChange,
  ): Promise<BoardStreamMessage> {
    if (change.kind === 'event') {
      const event = await this.reader.get(guildId, change.eventId);
      if (event === undefined) {
        throw notFound();
      }
      return { type: 'snapshot', event };
    }
    if (change.kind === 'roster') {
      return {
        type: 'roster-updated',
        roster: await this.reader.roster(
          guildId,
          change.eventId,
          change.encounter,
          change.squadId,
        ),
      };
    }
    const participant = await this.reader.participant(
      guildId,
      change.eventId,
      change.participantId,
    );
    return participant === undefined
      ? { type: 'participant-removed', participantId: change.participantId }
      : { type: 'participant-upserted', participant };
  }
}
