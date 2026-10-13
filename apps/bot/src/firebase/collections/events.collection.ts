import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type Encounter,
  participantDocId,
  typedCollection,
} from '@ulti-project/shared';
import {
  type CollectionReference,
  Firestore,
  type QuerySnapshot,
  Timestamp,
  type Transaction,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import {
  type EventDocument,
  EventStatus,
  type NewEvent,
  type NewParticipant,
  type ParticipantDocument,
  type StoredEvent,
} from '../models/event.model.js';
import { clearProgger, rosterDocId } from '../models/roster.model.js';
import { rostersOf } from './rosters.collection.js';

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
  | {
      kind: 'released';
      participant: StoredParticipant;
      rosterChanged: boolean;
    }
  | { kind: 'not-claimed'; participant: StoredParticipant }
  | { kind: 'event-missing' | 'participant-missing' }
  | { kind: 'claimed-by-other' };

@Injectable()
class EventsCollection {
  private readonly events: CollectionReference<EventDocument>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.events = typedCollection<EventDocument>(this.firestore, 'events');
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

  /** Stores where the event's message lives: its channel and message id. */
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

  /** Every guild's events that started at or before `cutoff`. */
  @SentryTraced()
  public async findStartedBy(cutoff: Date): Promise<StoredEvent[]> {
    const snapshot = await this.events
      .where('startsAt', '<=', Timestamp.fromDate(cutoff))
      .get();
    return EventsCollection.stored(snapshot);
  }

  /** Deletes the event with its participants and rosters. */
  @SentryTraced()
  public async purge(id: string): Promise<void> {
    await this.firestore.recursiveDelete(this.events.doc(id));
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
   * Stores the participant. Signing up again replaces everything except
   * their claim and `signedUpAt`, so they keep their place. Whether it wrote:
   * a sign-up that changes nothing isn't written.
   */
  @SentryTraced()
  public upsertParticipant(
    eventId: string,
    participant: NewParticipant,
  ): Promise<boolean> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.participants(eventId).doc(
        participantDocId(participant.discordId, participant.encounter),
      );
      const existing = (await tx.get(ref)).data();
      // replaced, not merged, so a synced role never stays beside a picked job (or the reverse)
      const next = existing
        ? {
            ...participant,
            signedUpAt: existing.signedUpAt,
            ...(existing.claim && { claim: existing.claim }),
          }
        : participant;
      if (isDeepStrictEqual(next, existing)) return false;
      tx.set(ref, next);
      return true;
    });
  }

  /**
   * Deletes the participant, taking them out of their claiming squad's roster,
   * and returns what was deleted.
   */
  @SentryTraced()
  public removeParticipant(
    eventId: string,
    participantId: string,
  ): Promise<
    { removed: ParticipantDocument; rosterChanged: boolean } | undefined
  > {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.participants(eventId).doc(participantId);
      const removed = (await tx.get(ref)).data();
      if (!removed) return undefined;
      const rosterChanged = removed.claim
        ? await this.unplace(
            tx,
            eventId,
            participantId,
            removed.encounter,
            removed.claim.squadId,
          )
        : false;
      tx.delete(ref);
      return { removed, rosterChanged };
    });
  }

  /**
   * Claims the participant for `squadId` unless the event is closed or another
   * of the guild's `squadIds` holds them; a claim by a squad that has since
   * been removed counts as none. A participant who is missing (they withdrew)
   * is never written, so a claim can't bring them back. Another guild's
   * event counts as missing.
   */
  @SentryTraced()
  public claim(
    guildId: string,
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
      if (event?.guildId !== guildId) return { kind: 'event-missing' };
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
   * withdrew) is never written. Another guild's event counts as missing.
   */
  @SentryTraced()
  public release(
    guildId: string,
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
      if (event?.guildId !== guildId) return { kind: 'event-missing' };
      if (!participant) return { kind: 'participant-missing' };
      const { claim, ...unclaimed } = participant;
      if (!claim || !squadIds.includes(claim.squadId)) {
        return {
          kind: 'not-claimed',
          participant: { ...participant, id: participantId },
        };
      }
      if (claim.squadId !== squadId) return { kind: 'claimed-by-other' };
      const rosterChanged = await this.unplace(
        tx,
        eventId,
        participantId,
        participant.encounter,
        squadId,
      );
      tx.set(ref, unclaimed);
      return {
        kind: 'released',
        participant: { ...unclaimed, id: participantId },
        rosterChanged,
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
  public async countParticipants(eventId: string): Promise<number> {
    return (await this.participants(eventId).count().get()).data().count;
  }

  @SentryTraced()
  public async getParticipant(
    eventId: string,
    participantId: string,
  ): Promise<ParticipantDocument | undefined> {
    return (await this.participants(eventId).doc(participantId).get()).data();
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
   * In `tx`, takes the progger out of `squadId`'s roster for `encounter`;
   * false if they had no progger slot there. It reads, then writes, so call
   * it before the transaction's own writes.
   */
  private async unplace(
    tx: Transaction,
    eventId: string,
    participantId: string,
    encounter: Encounter,
    squadId: string,
  ): Promise<boolean> {
    const ref = rostersOf(this.firestore, eventId).doc(
      rosterDocId(encounter, squadId),
    );
    const roster = (await tx.get(ref)).data();
    const cleared = roster && clearProgger(roster, participantId);
    if (!cleared) return false;
    tx.set(ref, cleared);
    return true;
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
