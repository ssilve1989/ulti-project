import { Test } from '@nestjs/testing';
import { Encounter } from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { FIRESTORE } from '../firebase.consts.js';
import type {
  EventScheduleDocument,
  ScheduleSettings,
} from '../models/event-schedule.model.js';
import { EventSchedulesCollection } from './event-schedules.collection.js';

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

// Thursday 8 October 2026, 08:00 in New York
const NOW = new Date('2026-10-08T12:00:00Z');
// Tuesday 13 October, 20:00 in New York, and 72 hours before it
const NEXT_TUESDAY = at('2026-10-14T00:00:00Z');
const NEXT_TUESDAY_POST = at('2026-10-11T00:00:00Z');

function settings(overrides: Partial<ScheduleSettings> = {}): ScheduleSettings {
  return {
    title: 'DSR prog night',
    encounters: [Encounter.DSR, Encounter.TOP],
    channelId: 'channel-1',
    weekdays: ['tue'],
    startTime: '20:00',
    timeZone: USTimeZones.EASTERN,
    postLeadHours: 72,
    signupsCloseBeforeHours: 2,
    ...overrides,
  };
}

function aSchedule(
  overrides: Partial<EventScheduleDocument> = {},
): EventScheduleDocument {
  return {
    ...settings(),
    guildId: 'guild-1',
    paused: false,
    nextStartAt: NEXT_TUESDAY,
    nextPostAt: NEXT_TUESDAY_POST,
    createdBy: 'organizer-1',
    updatedBy: 'organizer-1',
    ...overrides,
  };
}

/** `schedule` once paused: no longer due to post. */
function paused({
  nextPostAt: _post,
  ...schedule
}: EventScheduleDocument): EventScheduleDocument {
  return { ...schedule, paused: true };
}

const SCHEDULE_ID = 'schedule-1';
const SCHEDULE_PATH = `event-schedules/${SCHEDULE_ID}`;

const it = base.extend<{
  db: InMemoryFirestore;
  collection: EventSchedulesCollection;
}>({
  db: fresh(() => new InMemoryFirestore()),
  collection: async ({ db }, use) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventSchedulesCollection,
        { provide: FIRESTORE, useValue: db },
      ],
    }).compile();
    await use(moduleRef.get(EventSchedulesCollection));
  },
});

describe('EventSchedulesCollection', () => {
  describe('when a schedule is created', () => {
    it('stores it with its next start and its post time 72 hours before', async ({
      db,
      collection,
    }) => {
      const created = await collection.create(
        'guild-1',
        settings(),
        'organizer-1',
        NOW,
      );

      expect(db.read(`event-schedules/${created.id}`)).toEqual(aSchedule());
      expect(created).toEqual({ ...aSchedule(), id: created.id });
    });
  });

  describe('when a schedule is updated', () => {
    it('changes only the given fields and recomputes its times from now', async ({
      db,
      collection,
    }) => {
      db.seed(
        SCHEDULE_PATH,
        aSchedule({
          nextStartAt: at('2026-10-07T00:00:00Z'),
          nextPostAt: at('2026-10-04T00:00:00Z'),
        }),
      );

      const updated = await collection.update(
        SCHEDULE_ID,
        { title: 'TOP prog night', weekdays: ['wed'] },
        'organizer-2',
        NOW,
      );

      // Wednesday 14 October, 20:00 in New York, and 72 hours before it
      const stored = aSchedule({
        title: 'TOP prog night',
        weekdays: ['wed'],
        nextStartAt: at('2026-10-15T00:00:00Z'),
        nextPostAt: at('2026-10-12T00:00:00Z'),
        updatedBy: 'organizer-2',
      });
      expect(db.read(SCHEDULE_PATH)).toEqual(stored);
      expect(updated).toEqual({ ...stored, id: SCHEDULE_ID });
    });
  });

  describe('when a paused schedule is updated', () => {
    it('keeps it not due to post', async ({ db, collection }) => {
      db.seed(SCHEDULE_PATH, paused(aSchedule()));

      await collection.update(
        SCHEDULE_ID,
        { weekdays: ['wed'] },
        'organizer-2',
        NOW,
      );

      expect(db.read(SCHEDULE_PATH)).toEqual(
        paused(
          aSchedule({
            weekdays: ['wed'],
            nextStartAt: at('2026-10-15T00:00:00Z'),
            updatedBy: 'organizer-2',
          }),
        ),
      );
    });
  });

  describe('when a missing schedule is updated', () => {
    it('returns undefined and stores nothing', async ({ db, collection }) => {
      const updated = await collection.update(
        SCHEDULE_ID,
        { title: 'TOP prog night' },
        'organizer-2',
        NOW,
      );

      expect(updated).toBeUndefined();
      expect(db.read(SCHEDULE_PATH)).toBeUndefined();
    });
  });

  describe('when a schedule is paused', () => {
    it('removes its post time and keeps its next start', async ({
      db,
      collection,
    }) => {
      db.seed(SCHEDULE_PATH, aSchedule());

      const updated = await collection.setPaused(SCHEDULE_ID, true, NOW);

      expect(db.read(SCHEDULE_PATH)).toEqual(paused(aSchedule()));
      expect(updated).toEqual({ ...paused(aSchedule()), id: SCHEDULE_ID });
    });
  });

  describe('when a paused schedule is resumed', () => {
    it('restores both times, computed from now', async ({ db, collection }) => {
      db.seed(
        SCHEDULE_PATH,
        paused(aSchedule({ nextStartAt: at('2026-10-07T00:00:00Z') })),
      );

      const updated = await collection.setPaused(SCHEDULE_ID, false, NOW);

      expect(db.read(SCHEDULE_PATH)).toEqual(aSchedule());
      expect(updated).toEqual({ ...aSchedule(), id: SCHEDULE_ID });
    });
  });

  describe('when a missing schedule is paused', () => {
    it('returns undefined and stores nothing', async ({ db, collection }) => {
      expect(
        await collection.setPaused(SCHEDULE_ID, true, NOW),
      ).toBeUndefined();
      expect(db.read(SCHEDULE_PATH)).toBeUndefined();
    });
  });

  describe('when due schedules are looked up', () => {
    it('returns only unpaused schedules at or past their post time', async ({
      db,
      collection,
    }) => {
      const due = aSchedule({ nextPostAt: at('2026-10-08T11:00:00Z') });
      const dueNow = aSchedule({ nextPostAt: Timestamp.fromDate(NOW) });
      db.seed('event-schedules/due-later', aSchedule());
      db.seed('event-schedules/due-now', dueNow);
      db.seed('event-schedules/due', due);
      db.seed('event-schedules/paused', paused(due));

      expect(await collection.findDue(NOW)).toEqual([
        { ...due, id: 'due' },
        { ...dueNow, id: 'due-now' },
      ]);
    });
  });

  describe("when a guild's schedules are listed", () => {
    it('returns only that guild’s schedules', async ({ db, collection }) => {
      const other = aSchedule({ title: 'TOP prog night' });
      db.seed('event-schedules/a', aSchedule());
      db.seed('event-schedules/b', paused(other));
      db.seed('event-schedules/c', aSchedule({ guildId: 'guild-2' }));

      expect(await collection.listForGuild('guild-1')).toEqual([
        { ...aSchedule(), id: 'a' },
        { ...paused(other), id: 'b' },
      ]);
    });
  });

  describe('when a schedule is advanced past its posted occurrence', () => {
    it('moves both times to the next occurrence', async ({
      db,
      collection,
    }) => {
      db.seed(SCHEDULE_PATH, aSchedule());

      await collection.advance(SCHEDULE_ID, NEXT_TUESDAY.toDate());

      // Tuesday 20 October, 20:00 in New York, and 72 hours before it
      expect(db.read(SCHEDULE_PATH)).toEqual(
        aSchedule({
          nextStartAt: at('2026-10-21T00:00:00Z'),
          nextPostAt: at('2026-10-18T00:00:00Z'),
        }),
      );
    });
  });

  describe('when a paused schedule is advanced', () => {
    it('moves its next start and keeps it not due to post', async ({
      db,
      collection,
    }) => {
      db.seed(SCHEDULE_PATH, paused(aSchedule()));

      await collection.advance(SCHEDULE_ID, NEXT_TUESDAY.toDate());

      expect(db.read(SCHEDULE_PATH)).toEqual(
        paused(aSchedule({ nextStartAt: at('2026-10-21T00:00:00Z') })),
      );
    });
  });

  describe('when a missing schedule is advanced', () => {
    it('stores nothing', async ({ db, collection }) => {
      await collection.advance(SCHEDULE_ID, NEXT_TUESDAY.toDate());

      expect(db.read(SCHEDULE_PATH)).toBeUndefined();
    });
  });

  describe('when a schedule is deleted', () => {
    it('removes it and reports that it existed', async ({ db, collection }) => {
      db.seed(SCHEDULE_PATH, aSchedule());

      expect(await collection.delete(SCHEDULE_ID)).toBe(true);
      expect(db.read(SCHEDULE_PATH)).toBeUndefined();
    });
  });

  describe('when a missing schedule is deleted', () => {
    it('reports that it did not exist', async ({ collection }) => {
      expect(await collection.delete(SCHEDULE_ID)).toBe(false);
    });
  });
});
