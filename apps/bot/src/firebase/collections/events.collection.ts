import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { type Encounter, typedCollection } from '@ulti-project/shared';
import {
  type CollectionReference,
  Firestore,
  type QuerySnapshot,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import {
  type EventDocument,
  EventStatus,
  type NewEvent,
  type ParticipantDocument,
  type StoredEvent,
} from '../models/event.model.js';

@Injectable()
class EventsCollection {
  private readonly events: CollectionReference<EventDocument>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.events = typedCollection<EventDocument>(this.firestore, 'events');
  }

  public static participantId(discordId: string, encounter: Encounter) {
    return `${discordId}-${encounter}`;
  }

  @SentryTraced()
  public async create(event: NewEvent): Promise<StoredEvent> {
    const ref = this.events.doc();
    const document = EventsCollection.opened(event);
    await ref.create(document);
    return { ...document, id: ref.id };
  }

  /** Creates the event under `id` unless one exists, which it returns instead. */
  @SentryTraced()
  public createIfAbsent(id: string, event: NewEvent): Promise<StoredEvent> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.events.doc(id);
      const existing = (await tx.get(ref)).data();
      if (existing) return { ...existing, id };
      const document = EventsCollection.opened(event);
      tx.set(ref, document);
      return { ...document, id };
    });
  }

  @SentryTraced()
  public async get(id: string): Promise<StoredEvent | undefined> {
    const data = (await this.events.doc(id).get()).data();
    return data && { ...data, id };
  }

  /** Deletes the event document; only for an event that has no participants yet. */
  @SentryTraced()
  public async delete(id: string): Promise<void> {
    await this.events.doc(id).delete();
  }

  @SentryTraced()
  public async setMessageId(id: string, messageId: string): Promise<void> {
    await this.events.doc(id).update({ messageId });
  }

  /** The guild's events that aren't closed, soonest first. */
  @SentryTraced()
  public async findActive(guildId: string): Promise<StoredEvent[]> {
    const snapshot = await this.events
      .where('guildId', '==', guildId)
      .where('status', 'in', [EventStatus.Open, EventStatus.SignupsClosed])
      .get();
    return EventsCollection.stored(snapshot).sort(
      (a, b) => a.startsAt.toMillis() - b.startsAt.toMillis(),
    );
  }

  /** Open events at or past their sign-up cutoff. */
  @SentryTraced()
  public async findDueToCloseSignups(now: Date): Promise<StoredEvent[]> {
    const snapshot = await this.events
      .where('signupsCloseDueAt', '<=', Timestamp.fromDate(now))
      .get();
    return EventsCollection.stored(snapshot);
  }

  /** The updated event, or undefined unless it was `open`. */
  @SentryTraced()
  public closeSignups(id: string): Promise<StoredEvent | undefined> {
    return this.transition(id, [EventStatus.Open], EventStatus.SignupsClosed);
  }

  /** The updated event, or undefined if it's missing or already closed. */
  @SentryTraced()
  public close(id: string): Promise<StoredEvent | undefined> {
    return this.transition(
      id,
      [EventStatus.Open, EventStatus.SignupsClosed],
      EventStatus.Closed,
    );
  }

  /**
   * Stores the participant. Signing up again replaces only their job,
   * character and phase: their claim and `signedUpAt` are kept, so they keep
   * their place.
   */
  @SentryTraced()
  public upsertParticipant(
    eventId: string,
    participant: Omit<ParticipantDocument, 'claim'>,
  ): Promise<void> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.participants(eventId).doc(
        EventsCollection.participantId(
          participant.discordId,
          participant.encounter,
        ),
      );
      const existing = (await tx.get(ref)).data();
      tx.set(
        ref,
        existing
          ? { ...existing, ...participant, signedUpAt: existing.signedUpAt }
          : participant,
      );
    });
  }

  /** Deletes the participant, returning what was deleted. */
  @SentryTraced()
  public removeParticipant(
    eventId: string,
    participantId: string,
  ): Promise<ParticipantDocument | undefined> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.participants(eventId).doc(participantId);
      const existing = (await tx.get(ref)).data();
      if (existing) tx.delete(ref);
      return existing;
    });
  }

  @SentryTraced()
  public async listParticipants(
    eventId: string,
  ): Promise<ParticipantDocument[]> {
    const snapshot = await this.participants(eventId).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async findParticipantsOf(
    eventId: string,
    discordId: string,
  ): Promise<ParticipantDocument[]> {
    const snapshot = await this.participants(eventId)
      .where('discordId', '==', discordId)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  private static opened(event: NewEvent): EventDocument {
    return {
      ...event,
      status: EventStatus.Open,
      signupsCloseDueAt: event.signupsCloseAt,
    };
  }

  private static stored(snapshot: QuerySnapshot<EventDocument>) {
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  }

  private participants(eventId: string) {
    return typedCollection<ParticipantDocument>(
      this.events.doc(eventId),
      'participants',
    );
  }

  /**
   * Moves the event from one of `from` to `to`, rewriting the whole document
   * without `signupsCloseDueAt`, which only an `open` event carries.
   */
  private transition(
    id: string,
    from: readonly EventStatus[],
    to: EventStatus,
  ): Promise<StoredEvent | undefined> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.events.doc(id);
      const current = (await tx.get(ref)).data();
      if (!current || !from.includes(current.status)) return undefined;
      const { signupsCloseDueAt: _due, ...rest } = current;
      const next: EventDocument = { ...rest, status: to };
      tx.set(ref, next);
      return { ...next, id };
    });
  }
}

export { EventsCollection };
