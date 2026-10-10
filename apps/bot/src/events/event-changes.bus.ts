import { Injectable } from '@nestjs/common';
import type { Encounter } from '@ulti-project/shared';
import { filter, type Observable, Subject } from 'rxjs';

/** What changed in an event, by id only: the board reads the rest. */
export type EventChange =
  | { kind: 'participant'; eventId: string; participantId: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'roster'; eventId: string; encounter: Encounter; squadId: string };

/**
 * Carries event changes, in process, to the board's open streams. Publish a
 * change only once it's stored.
 */
@Injectable()
export class EventChangesBus {
  private readonly subject = new Subject<EventChange>();

  publish(change: EventChange): void {
    this.subject.next(change);
  }

  /** `eventId`'s changes, from now on. */
  changes(eventId: string): Observable<EventChange> {
    return this.subject.pipe(filter((change) => change.eventId === eventId));
  }
}
