import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type Encounter,
  type RosterSlot,
  type SlotFill,
  typedCollection,
} from '@ulti-project/shared';
import { Firestore, type Transaction } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import {
  type EventDocument,
  EventStatus,
  type ParticipantDocument,
} from '../models/event.model.js';
import {
  placeInRoster,
  type RosterDocument,
  rosterDocId,
} from '../models/roster.model.js';

type RosterFailure = {
  kind:
    | 'event-missing'
    | 'team-missing'
    | 'event-closed'
    | 'team-limit'
    | 'team-not-empty'
    | 'not-claimed';
};

export type RosterOutcome =
  | { kind: 'ok'; roster: RosterDocument }
  | RosterFailure;

/** Who to put in a slot: a progger by their participant id, or a helper. */
export type SlotPick =
  | { kind: 'progger'; participantId: string }
  | Extract<SlotFill, { kind: 'helper' }>;

const MAX_TEAMS = 6;

/** Squads' rosters: `events/{eventId}/rosters/{encounter}-{squadId}`. */
@Injectable()
export class RostersCollection {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  @SentryTraced()
  public async list(eventId: string): Promise<RosterDocument[]> {
    const snapshot = await this.rosters(eventId).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async get(
    eventId: string,
    encounter: Encounter,
    squadId: string,
  ): Promise<RosterDocument | undefined> {
    return (
      await this.rosters(eventId).doc(rosterDocId(encounter, squadId)).get()
    ).data();
  }

  /** Adds an empty team, up to six. */
  @SentryTraced()
  public addTeam(
    eventId: string,
    encounter: Encounter,
    squadId: string,
    guildId: string,
    newTeamId: string,
  ): Promise<RosterOutcome> {
    return this.change(eventId, encounter, squadId, (roster) => {
      const current = roster ?? { guildId, encounter, squadId, teams: [] };
      if (current.teams.length >= MAX_TEAMS) return { kind: 'team-limit' };
      return {
        ...current,
        teams: [...current.teams, { id: newTeamId, slots: {} }],
      };
    });
  }

  /** Removes a team whose slots are all empty. */
  @SentryTraced()
  public removeTeam(
    eventId: string,
    encounter: Encounter,
    squadId: string,
    teamId: string,
  ): Promise<RosterOutcome> {
    return this.change(eventId, encounter, squadId, (roster) => {
      const team = roster?.teams.find(({ id }) => id === teamId);
      if (!roster || !team) return { kind: 'team-missing' };
      if (Object.keys(team.slots).length > 0) return { kind: 'team-not-empty' };
      return {
        ...roster,
        teams: roster.teams.filter(({ id }) => id !== teamId),
      };
    });
  }

  /**
   * Puts `pick` in the team's slot, moving them out of any other. A progger
   * must be signed up for the encounter and claimed by the squad.
   */
  @SentryTraced()
  public fillSlot(
    eventId: string,
    encounter: Encounter,
    squadId: string,
    teamId: string,
    slot: RosterSlot,
    pick: SlotPick,
  ): Promise<RosterOutcome> {
    return this.change(eventId, encounter, squadId, async (roster, tx) => {
      if (!roster?.teams.some(({ id }) => id === teamId)) {
        return { kind: 'team-missing' };
      }
      let fill: SlotFill;
      if (pick.kind === 'helper') {
        fill = pick;
      } else {
        const participant = (
          await tx.get(this.participants(eventId).doc(pick.participantId))
        ).data();
        if (
          participant?.encounter !== encounter ||
          participant.claim?.squadId !== squadId
        ) {
          return { kind: 'not-claimed' };
        }
        fill = { ...pick, discordId: participant.discordId };
      }
      return placeInRoster(roster, teamId, slot, fill);
    });
  }

  /** Empties the team's slot. */
  @SentryTraced()
  public clearSlot(
    eventId: string,
    encounter: Encounter,
    squadId: string,
    teamId: string,
    slot: RosterSlot,
  ): Promise<RosterOutcome> {
    return this.change(eventId, encounter, squadId, (roster) => {
      if (!roster?.teams.some(({ id }) => id === teamId)) {
        return { kind: 'team-missing' };
      }
      return {
        ...roster,
        teams: roster.teams.map((team) => {
          if (team.id !== teamId) return team;
          const { [slot]: _cleared, ...slots } = team.slots;
          return { ...team, slots };
        }),
      };
    });
  }

  /**
   * One transaction: reads the event and the squad's roster, and unless the
   * event is missing or closed, writes the whole roster `update` makes of it.
   */
  private change(
    eventId: string,
    encounter: Encounter,
    squadId: string,
    update: (
      roster: RosterDocument | undefined,
      tx: Transaction,
    ) =>
      | RosterDocument
      | RosterFailure
      | Promise<RosterDocument | RosterFailure>,
  ): Promise<RosterOutcome> {
    return this.firestore.runTransaction(async (tx) => {
      const ref = this.rosters(eventId).doc(rosterDocId(encounter, squadId));
      const [event, roster] = await Promise.all([
        tx.get(this.events().doc(eventId)).then((doc) => doc.data()),
        tx.get(ref).then((doc) => doc.data()),
      ]);
      if (!event) return { kind: 'event-missing' };
      if (event.status === EventStatus.Closed) return { kind: 'event-closed' };
      const updated = await update(roster, tx);
      if ('kind' in updated) return updated;
      tx.set(ref, updated);
      return { kind: 'ok', roster: updated };
    });
  }

  private events() {
    return typedCollection<EventDocument>(this.firestore, 'events');
  }

  private participants(eventId: string) {
    return typedCollection<ParticipantDocument>(
      this.firestore,
      `events/${eventId}/participants`,
    );
  }

  private rosters(eventId: string) {
    return typedCollection<RosterDocument>(
      this.firestore,
      `events/${eventId}/rosters`,
    );
  }
}
