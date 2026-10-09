import { HttpStatus, Injectable } from '@nestjs/common';
import type { BoardStreamMessage } from '@ulti-project/shared';
import { concatMap, merge, type Observable, of } from 'rxjs';
import {
  type EventChange,
  EventChangesBus,
} from '../../events/event-changes.bus.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { BoardEventReader } from './board-event.reader.js';

/** What an open board hears about an event: its snapshot, then each change. */
@Injectable()
export class EventStreamService {
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
    return merge(
      this.bus.changes(eventId),
      of<EventChange>({ kind: 'event', eventId }),
    ).pipe(concatMap((change) => this.resolve(guildId, change)));
  }

  private async resolve(
    guildId: string,
    change: EventChange,
  ): Promise<BoardStreamMessage> {
    if (change.kind === 'event') {
      const event = await this.reader.get(guildId, change.eventId);
      if (event === undefined) {
        throw new BoardHttpError(HttpStatus.NOT_FOUND, 'not-found');
      }
      return { type: 'snapshot', event };
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
