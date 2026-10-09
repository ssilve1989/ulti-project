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

type StoredParticipant = ParticipantDocument & { id: string };

type ClaimOutcome =
  | { kind: 'claimed' | 'already-yours'; participant: StoredParticipant }
  | { kind: 'event-missing' | 'participant-missing' }
  | { kind: 'event-closed' }
  | {
      kind: 'claimed-by-other';
      claim: NonNullable<ParticipantDocument['claim']>;
    };

type ReleaseOutcome =
  | { kind: 'released' | 'not-claimed'; participant: StoredParticipant }
  | { kind: 'event-missing' | 'participant-missing' }
  | { kind: 'claimed-by-other' };

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

  /** The schedule's events, of any status, that haven't started, soonest first. */
  @SentryTraced()
  public async findFutureForSchedule(
    scheduleId: string,
    now: Date,
  ): Promise<StoredEvent[]> {
    // an equality filter only, so no composite index; the start is checked here
    const snapshot = await this.events
      .where('scheduleId', '==', scheduleId)
      .get();
    return EventsCollection.stored(snapshot)
      .filter((event) => event.startsAt.toMillis() > now.getTime())
      .sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis());
  }

  /** The schedule's events, of any status, starting at `startsAt`. */
  @SentryTraced()
  public async findForScheduleAt(
    scheduleId: string,
    startsAt: Timestamp,
  ): Promise<StoredEvent[]> {
    // equality filters only, so no composite index
    const snapshot = await this.events
      .where('scheduleId', '==', scheduleId)
      .where('startsAt', '==', startsAt)
      .get();
    return EventsCollection.stored(snapshot);
  }

  /**
   * Applies `changes` to an event that isn't closed, rewriting the whole
   * document: it's `open` (due at its cutoff) if the new cutoff is after `now`,
   * else `signups-closed`. Undefined if it's missing or closed.
   */
  @SentryTraced()
  public reschedule(
    id: string,
    changes: Pick<
      EventDocument,
      'title' | 'encounters' | 'startsAt' | 'signupsCloseAt'
    >,
    now: Date,
  ): Promise<StoredEvent | undefined> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.events.doc(id);
      const current = (await tx.get(ref)).data();
      if (!current || current.status === EventStatus.Closed) return undefined;
      const { signupsCloseDueAt: _due, ...rest } = current;
      const changed = { ...rest, ...changes };
      const next: EventDocument =
        changes.signupsCloseAt.toMillis() > now.getTime()
          ? {
              ...changed,
              status: EventStatus.Open,
              signupsCloseDueAt: changes.signupsCloseAt,
            }
          : { ...changed, status: EventStatus.SignupsClosed };
      tx.set(ref, next);
      return { ...next, id };
    });
  }

  /** Stores the event's message after it moved to another channel. */
  @SentryTraced()
  public async setMessage(
    id: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await this.events.doc(id).update({ channelId, messageId });
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

  /**
   * Claims the participant for `squadId` unless the event is closed or another
   * of the guild's `squadIds` holds them; a claim by a squad that has since
   * been removed counts as none. A participant who is missing (they withdrew)
   * is never written, so a claim can't bring them back.
   */
  @SentryTraced()
  public claim(
    eventId: string,
    participantId: string,
    squadId: string,
    by: string,
    now: Date,
    squadIds: readonly string[],
  ): Promise<ClaimOutcome> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.participants(eventId).doc(participantId);
      const [event, participant] = await Promise.all([
        tx.get(this.events.doc(eventId)).then((doc) => doc.data()),
        tx.get(ref).then((doc) => doc.data()),
      ]);
      if (!event) return { kind: 'event-missing' };
      if (event.status === EventStatus.Closed) return { kind: 'event-closed' };
      if (!participant) return { kind: 'participant-missing' };
      if (participant.claim && squadIds.includes(participant.claim.squadId)) {
        return participant.claim.squadId === squadId
          ? {
              kind: 'already-yours',
              participant: { ...participant, id: participantId },
            }
          : { kind: 'claimed-by-other', claim: participant.claim };
      }
      const claimed: ParticipantDocument = {
        ...participant,
        claim: { squadId, claimedBy: by, claimedAt: Timestamp.fromDate(now) },
      };
      tx.set(ref, claimed);
      return {
        kind: 'claimed',
        participant: { ...claimed, id: participantId },
      };
    });
  }

  /**
   * Removes `squadId`'s claim on the participant; another of the guild's
   * `squadIds` keeps theirs. A claim by a squad that has since been removed
   * counts as none, and is left as it is. A participant who is missing (they
   * withdrew) is never written.
   */
  @SentryTraced()
  public release(
    eventId: string,
    participantId: string,
    squadId: string,
    squadIds: readonly string[],
  ): Promise<ReleaseOutcome> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.participants(eventId).doc(participantId);
      const [event, participant] = await Promise.all([
        tx.get(this.events.doc(eventId)).then((doc) => doc.data()),
        tx.get(ref).then((doc) => doc.data()),
      ]);
      if (!event) return { kind: 'event-missing' };
      if (!participant) return { kind: 'participant-missing' };
      const { claim, ...unclaimed } = participant;
      if (!claim || !squadIds.includes(claim.squadId)) {
        return {
          kind: 'not-claimed',
          participant: { ...participant, id: participantId },
        };
      }
      if (claim.squadId !== squadId) return { kind: 'claimed-by-other' };
      tx.set(ref, unclaimed);
      return {
        kind: 'released',
        participant: { ...unclaimed, id: participantId },
      };
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
