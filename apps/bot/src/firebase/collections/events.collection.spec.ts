import { Test } from '@nestjs/testing';
import { Encounter, Job } from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect } from 'vitest';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { FIRESTORE } from '../firebase.consts.js';
import {
  type EventDocument,
  EventStatus,
  type NewEvent,
  type ParticipantDocument,
} from '../models/event.model.js';
import { EventsCollection } from './events.collection.js';

const STARTS_AT = Timestamp.fromDate(new Date('2026-10-10T20:00:00Z'));
const CUTOFF = Timestamp.fromDate(new Date('2026-10-10T18:00:00Z'));
const NOW = new Date('2026-10-10T18:30:00Z');

function aNewEvent(overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    guildId: 'guild-1',
    title: 'DSR prog night',
    startsAt: STARTS_AT,
    signupsCloseAt: CUTOFF,
    encounters: [Encounter.DSR, Encounter.TOP],
    channelId: 'channel-1',
    createdBy: 'organizer-1',
    ...overrides,
  };
}

function anOpenEvent(overrides: Partial<EventDocument> = {}): EventDocument {
  return {
    ...aNewEvent(),
    status: EventStatus.Open,
    signupsCloseDueAt: CUTOFF,
    messageId: 'message-1',
    ...overrides,
  };
}

/** `event` once it has left `open`: no longer due to close sign-ups. */
function withStatus(
  { signupsCloseDueAt: _due, ...event }: EventDocument,
  status: EventStatus,
): EventDocument {
  return { ...event, status };
}

function aParticipant(
  overrides: Partial<ParticipantDocument> = {},
): ParticipantDocument {
  return {
    discordId: 'player-1',
    encounter: Encounter.DSR,
    job: Job.WAR,
    character: 'Test Character',
    world: 'Jenova',
    phase: { roleId: 'role-p6', label: 'P6', order: 6, bucket: 'prog' },
    signedUpAt: Timestamp.fromDate(new Date('2026-10-08T12:00:00Z')),
    ...overrides,
  };
}

const CLAIM = Object.freeze({
  squadId: 'squad-1',
  claimedBy: 'organizer-1',
  claimedAt: Timestamp.fromDate(new Date('2026-10-09T12:00:00Z')),
});

const EVENT_ID = 'event-1';
const EVENT_PATH = `events/${EVENT_ID}`;
const PARTICIPANT_ID = EventsCollection.participantId(
  'player-1',
  Encounter.DSR,
);
const PARTICIPANT_PATH = `${EVENT_PATH}/participants/${PARTICIPANT_ID}`;

const it = base.extend<{
  db: InMemoryFirestore;
  collection: EventsCollection;
}>({
  db: fresh(() => new InMemoryFirestore()),
  collection: async ({ db }, use) => {
    const moduleRef = await Test.createTestingModule({
      providers: [EventsCollection, { provide: FIRESTORE, useValue: db }],
    }).compile();
    await use(moduleRef.get(EventsCollection));
  },
});

describe('EventsCollection', () => {
  describe('when an event is created', () => {
    it('stores it open and due to close sign-ups at its cutoff', async ({
      db,
      collection,
    }) => {
      const created = await collection.create(aNewEvent());

      const stored: EventDocument = {
        ...aNewEvent(),
        status: EventStatus.Open,
        signupsCloseDueAt: CUTOFF,
      };
      expect(db.read(`events/${created.id}`)).toEqual(stored);
      expect(created).toEqual({ ...stored, id: created.id });
    });
  });

  describe('when an event is created twice under the same id', () => {
    it('returns the first and leaves it unchanged', async ({
      db,
      collection,
    }) => {
      const first = await collection.createIfAbsent(EVENT_ID, aNewEvent());

      const second = await collection.createIfAbsent(
        EVENT_ID,
        aNewEvent({ title: 'Another title' }),
      );

      const stored: EventDocument = {
        ...aNewEvent(),
        status: EventStatus.Open,
        signupsCloseDueAt: CUTOFF,
      };
      expect(second).toEqual({ ...stored, id: EVENT_ID });
      expect(first).toEqual(second);
      expect(db.read(EVENT_PATH)).toEqual(stored);
    });
  });

  describe('when the event message is posted', () => {
    it('stores its id', async ({ db, collection }) => {
      db.seed(EVENT_PATH, anOpenEvent({ messageId: undefined }));

      await collection.setMessageId(EVENT_ID, 'message-2');

      expect(db.read(EVENT_PATH)).toEqual(
        anOpenEvent({ messageId: 'message-2' }),
      );
    });
  });

  describe('when an event is read', () => {
    it('returns it with its id', async ({ db, collection }) => {
      db.seed(EVENT_PATH, anOpenEvent());

      expect(await collection.get(EVENT_ID)).toEqual({
        ...anOpenEvent(),
        id: EVENT_ID,
      });
    });

    it('returns undefined when it does not exist', async ({ collection }) => {
      expect(await collection.get('missing')).toBeUndefined();
    });
  });

  describe('when an event is deleted', () => {
    it('removes it', async ({ db, collection }) => {
      db.seed(EVENT_PATH, anOpenEvent());

      await collection.delete(EVENT_ID);

      expect(db.read(EVENT_PATH)).toBeUndefined();
    });
  });

  describe('when sign-ups close', () => {
    it('stores an open event as signups-closed, no longer due', async ({
      db,
      collection,
    }) => {
      db.seed(EVENT_PATH, anOpenEvent());

      const updated = await collection.closeSignups(EVENT_ID);

      const stored = withStatus(anOpenEvent(), EventStatus.SignupsClosed);
      expect(db.read(EVENT_PATH)).toEqual(stored);
      expect(updated).toEqual({ ...stored, id: EVENT_ID });
    });

    it('changes nothing on a closed event and returns undefined', async ({
      db,
      collection,
    }) => {
      const closed = withStatus(anOpenEvent(), EventStatus.Closed);
      db.seed(EVENT_PATH, closed);

      const updated = await collection.closeSignups(EVENT_ID);

      expect(updated).toBeUndefined();
      expect(db.read(EVENT_PATH)).toEqual(closed);
    });
  });

  describe('when an event is closed', () => {
    it('stores an open event as closed, no longer due', async ({
      db,
      collection,
    }) => {
      db.seed(EVENT_PATH, anOpenEvent());

      const updated = await collection.close(EVENT_ID);

      const stored = withStatus(anOpenEvent(), EventStatus.Closed);
      expect(db.read(EVENT_PATH)).toEqual(stored);
      expect(updated).toEqual({ ...stored, id: EVENT_ID });
    });

    it('stores a signups-closed event as closed', async ({
      db,
      collection,
    }) => {
      db.seed(EVENT_PATH, withStatus(anOpenEvent(), EventStatus.SignupsClosed));

      const updated = await collection.close(EVENT_ID);

      const stored = withStatus(anOpenEvent(), EventStatus.Closed);
      expect(db.read(EVENT_PATH)).toEqual(stored);
      expect(updated).toEqual({ ...stored, id: EVENT_ID });
    });

    it('returns undefined when it is already closed or missing', async ({
      db,
      collection,
    }) => {
      const closed = withStatus(anOpenEvent(), EventStatus.Closed);
      db.seed(EVENT_PATH, closed);

      expect(await collection.close(EVENT_ID)).toBeUndefined();
      expect(await collection.close('missing')).toBeUndefined();
      expect(db.read(EVENT_PATH)).toEqual(closed);
    });
  });

  describe('when looking for events due to close sign-ups', () => {
    it('returns only open events at or past their cutoff', async ({
      db,
      collection,
    }) => {
      const due = anOpenEvent();
      db.seed('events/due', due);
      db.seed(
        'events/future',
        anOpenEvent({
          signupsCloseAt: STARTS_AT,
          signupsCloseDueAt: STARTS_AT,
        }),
      );
      db.seed(
        'events/closed',
        withStatus(anOpenEvent(), EventStatus.SignupsClosed),
      );

      expect(await collection.findDueToCloseSignups(NOW)).toEqual([
        { ...due, id: 'due' },
      ]);
    });
  });

  describe("when listing a guild's active events", () => {
    it('returns those not closed, soonest first', async ({
      db,
      collection,
    }) => {
      const later = anOpenEvent({
        startsAt: Timestamp.fromDate(new Date('2026-10-12T20:00:00Z')),
      });
      const sooner = withStatus(anOpenEvent(), EventStatus.SignupsClosed);
      db.seed('events/later', later);
      db.seed('events/sooner', sooner);
      db.seed('events/closed', withStatus(anOpenEvent(), EventStatus.Closed));
      db.seed('events/elsewhere', anOpenEvent({ guildId: 'guild-2' }));

      expect(await collection.findActive('guild-1')).toEqual([
        { ...sooner, id: 'sooner' },
        { ...later, id: 'later' },
      ]);
    });
  });

  describe("when looking for a schedule's upcoming events", () => {
    it('returns those not started or closed, soonest first', async ({
      db,
      collection,
    }) => {
      const later = anOpenEvent({
        scheduleId: 'schedule-1',
        startsAt: Timestamp.fromDate(new Date('2026-10-12T20:00:00Z')),
      });
      const sooner = withStatus(
        anOpenEvent({ scheduleId: 'schedule-1' }),
        EventStatus.SignupsClosed,
      );
      db.seed('events/later', later);
      db.seed('events/sooner', sooner);
      db.seed(
        'events/started',
        anOpenEvent({
          scheduleId: 'schedule-1',
          startsAt: Timestamp.fromDate(NOW),
        }),
      );
      db.seed('events/closed', withStatus(later, EventStatus.Closed));
      db.seed('events/other', { ...later, scheduleId: 'schedule-2' });
      db.seed('events/unscheduled', anOpenEvent());

      expect(
        await collection.findUpcomingForSchedule('schedule-1', NOW),
      ).toEqual([
        { ...sooner, id: 'sooner' },
        { ...later, id: 'later' },
      ]);
    });
  });

  describe("when looking for a schedule's event at a start", () => {
    it('returns the ids of those at that start, whatever their status', async ({
      db,
      collection,
    }) => {
      const other = Timestamp.fromDate(new Date('2026-10-12T20:00:00Z'));
      db.seed(
        'events/closed',
        withStatus(
          anOpenEvent({ scheduleId: 'schedule-1' }),
          EventStatus.Closed,
        ),
      );
      db.seed('events/elsewhere', anOpenEvent({ scheduleId: 'schedule-2' }));
      db.seed(
        'events/later',
        anOpenEvent({ scheduleId: 'schedule-3', startsAt: other }),
      );

      expect({
        found: await collection.idsForScheduleAt('schedule-1', STARTS_AT),
        otherStart: await collection.idsForScheduleAt('schedule-3', STARTS_AT),
        none: await collection.idsForScheduleAt('schedule-4', STARTS_AT),
      }).toEqual({ found: ['closed'], otherStart: [], none: [] });
    });
  });

  describe('when an event is rescheduled', () => {
    const LATER_START = Timestamp.fromDate(new Date('2026-10-11T20:00:00Z'));
    const LATER_CUTOFF = Timestamp.fromDate(new Date('2026-10-11T18:00:00Z'));
    const CHANGES = Object.freeze({
      title: 'TOP prog night',
      encounters: [Encounter.TOP],
      startsAt: LATER_START,
      signupsCloseAt: LATER_CUTOFF,
    });

    it('reopens a signups-closed event whose new cutoff is ahead', async ({
      db,
      collection,
    }) => {
      db.seed(EVENT_PATH, withStatus(anOpenEvent(), EventStatus.SignupsClosed));

      const rescheduled = await collection.reschedule(EVENT_ID, CHANGES, NOW);

      const stored = anOpenEvent({
        ...CHANGES,
        signupsCloseDueAt: LATER_CUTOFF,
      });
      expect(db.read(EVENT_PATH)).toEqual(stored);
      expect(rescheduled).toEqual({ ...stored, id: EVENT_ID });
    });

    it('closes sign-ups on an open event whose new cutoff has passed', async ({
      db,
      collection,
    }) => {
      db.seed(EVENT_PATH, anOpenEvent());
      const changes = { ...CHANGES, signupsCloseAt: CUTOFF };

      const rescheduled = await collection.reschedule(EVENT_ID, changes, NOW);

      const stored = withStatus(
        anOpenEvent(changes),
        EventStatus.SignupsClosed,
      );
      expect(db.read(EVENT_PATH)).toEqual(stored);
      expect(rescheduled).toEqual({ ...stored, id: EVENT_ID });
    });

    it('changes nothing on a closed or missing event and returns undefined', async ({
      db,
      collection,
    }) => {
      const closed = withStatus(anOpenEvent(), EventStatus.Closed);
      db.seed(EVENT_PATH, closed);

      expect({
        closed: await collection.reschedule(EVENT_ID, CHANGES, NOW),
        missing: await collection.reschedule('missing', CHANGES, NOW),
        stored: db.documentsIn('events'),
      }).toEqual({
        closed: undefined,
        missing: undefined,
        stored: [{ id: EVENT_ID, path: EVENT_PATH, data: closed }],
      });
    });
  });

  describe('when the event message is moved to another channel', () => {
    it('stores the channel and the new message id', async ({
      db,
      collection,
    }) => {
      db.seed(EVENT_PATH, anOpenEvent());

      await collection.setMessage(EVENT_ID, 'channel-2', 'message-2');

      expect(db.read(EVENT_PATH)).toEqual(
        anOpenEvent({ channelId: 'channel-2', messageId: 'message-2' }),
      );
    });
  });

  describe('when a player signs up again with another job', () => {
    it('replaces the job and keeps the claim', async ({ db, collection }) => {
      db.seed(PARTICIPANT_PATH, { ...aParticipant(), claim: CLAIM });

      await collection.upsertParticipant(
        EVENT_ID,
        aParticipant({ job: Job.PLD }),
      );

      expect(db.read(PARTICIPANT_PATH)).toEqual({
        ...aParticipant({ job: Job.PLD }),
        claim: CLAIM,
      });
    });
  });

  describe('when a participant is removed', () => {
    it('returns what it deleted, claim included, then undefined', async ({
      db,
      collection,
    }) => {
      const participant = { ...aParticipant(), claim: CLAIM };
      db.seed(PARTICIPANT_PATH, participant);

      expect(
        await collection.removeParticipant(EVENT_ID, PARTICIPANT_ID),
      ).toEqual(participant);
      expect(db.read(PARTICIPANT_PATH)).toBeUndefined();
      expect(
        await collection.removeParticipant(EVENT_ID, PARTICIPANT_ID),
      ).toBeUndefined();
    });
  });

  describe("when reading an event's participants", () => {
    it.beforeEach(({ db }) => {
      for (const participant of [
        aParticipant(),
        aParticipant({ encounter: Encounter.TOP }),
        aParticipant({ discordId: 'player-2' }),
      ]) {
        db.seed(
          `${EVENT_PATH}/participants/${EventsCollection.participantId(participant.discordId, participant.encounter)}`,
          participant,
        );
      }
      db.seed('events/event-2/participants/player-3-DSR', {
        ...aParticipant({ discordId: 'player-3' }),
      });
    });

    it('lists all of them', async ({ collection }) => {
      expect(await collection.listParticipants(EVENT_ID)).toEqual([
        aParticipant(),
        aParticipant({ encounter: Encounter.TOP }),
        aParticipant({ discordId: 'player-2' }),
      ]);
    });

    it("finds one player's sign-ups", async ({ collection }) => {
      expect(await collection.findParticipantsOf(EVENT_ID, 'player-1')).toEqual(
        [aParticipant(), aParticipant({ encounter: Encounter.TOP })],
      );
    });
  });
});
