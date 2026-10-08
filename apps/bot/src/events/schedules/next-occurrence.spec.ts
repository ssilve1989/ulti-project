import { describe, expect, it } from 'vitest';
import { USTimeZones } from '../../common/time-zones.js';
import {
  firstFreeOccurrence,
  nextOccurrence,
  occurrenceOnDayOf,
  type Recurrence,
  signupsCloseAt,
  timeZoneLabel,
} from './next-occurrence.js';

const TUE_THU_8PM = Object.freeze<Recurrence>({
  weekdays: ['tue', 'thu'],
  startTime: '20:00',
  timeZone: USTimeZones.EASTERN,
});

describe('nextOccurrence', () => {
  describe('when a Tue/Thu 20:00 Eastern schedule is asked on Monday at noon', () => {
    it('returns Tuesday at 20:00 Eastern', () => {
      expect(
        nextOccurrence(TUE_THU_8PM, new Date('2026-07-13T16:00:00Z')),
      ).toEqual(new Date('2026-07-15T00:00:00Z'));
    });
  });

  describe('when it is asked on Tuesday at 19:59', () => {
    it('returns the same Tuesday', () => {
      expect(
        nextOccurrence(TUE_THU_8PM, new Date('2026-07-14T23:59:00Z')),
      ).toEqual(new Date('2026-07-15T00:00:00Z'));
    });
  });

  describe('when it is asked on Tuesday at 20:00 exactly', () => {
    it('returns Thursday', () => {
      expect(
        nextOccurrence(TUE_THU_8PM, new Date('2026-07-15T00:00:00Z')),
      ).toEqual(new Date('2026-07-17T00:00:00Z'));
    });
  });

  describe('when it is asked on Thursday at 21:00', () => {
    it('returns the next Tuesday', () => {
      expect(
        nextOccurrence(TUE_THU_8PM, new Date('2026-07-17T01:00:00Z')),
      ).toEqual(new Date('2026-07-22T00:00:00Z'));
    });
  });

  describe('when the only weekday is today and its time has passed', () => {
    it('returns the same weekday a week later', () => {
      expect(
        nextOccurrence(
          { ...TUE_THU_8PM, weekdays: ['tue'] },
          new Date('2026-07-15T01:00:00Z'),
        ),
      ).toEqual(new Date('2026-07-22T00:00:00Z'));
    });
  });

  describe('when a Sunday 01:30 occurrence falls on the fall-back day', () => {
    it('picks the earlier (EDT) of the two 01:30s', () => {
      expect(
        nextOccurrence(
          {
            weekdays: ['sun'],
            startTime: '01:30',
            timeZone: USTimeZones.EASTERN,
          },
          new Date('2026-10-31T16:00:00Z'),
        ),
      ).toEqual(new Date('2026-11-01T05:30:00Z'));
    });
  });

  describe('when a Sunday 02:30 occurrence is skipped by spring-forward', () => {
    it('moves it to 03:30 EDT', () => {
      expect(
        nextOccurrence(
          {
            weekdays: ['sun'],
            startTime: '02:30',
            timeZone: USTimeZones.EASTERN,
          },
          new Date('2026-03-07T17:00:00Z'),
        ),
      ).toEqual(new Date('2026-03-08T07:30:00Z'));
    });
  });

  describe('when a Saturday 22:00 Pacific schedule is asked on Monday', () => {
    it('returns Saturday at 22:00 Pacific, which is Sunday in UTC', () => {
      expect(
        nextOccurrence(
          {
            weekdays: ['sat'],
            startTime: '22:00',
            timeZone: USTimeZones.PACIFIC,
          },
          new Date('2026-07-13T16:00:00Z'),
        ),
      ).toEqual(new Date('2026-07-19T05:00:00Z'));
    });
  });

  describe('when the schedule has no weekdays', () => {
    it('throws', () => {
      expect(() =>
        nextOccurrence(
          { ...TUE_THU_8PM, weekdays: [] },
          new Date('2026-07-13T16:00:00Z'),
        ),
      ).toThrow('at least one weekday');
    });
  });
});

describe('occurrenceOnDayOf', () => {
  describe('when a Tue/Thu 20:00 Eastern schedule is asked for Thursday 22:00 Eastern, already Friday in UTC', () => {
    it('returns that Thursday at 20:00 Eastern', () => {
      expect(
        occurrenceOnDayOf(
          TUE_THU_8PM,
          new Date('2026-07-17T02:00:00Z'),
          USTimeZones.EASTERN,
        ),
      ).toEqual(new Date('2026-07-17T00:00:00Z'));
    });
  });

  describe('when it is asked for Thursday 22:00 Pacific, already Friday in Eastern', () => {
    it('returns that Thursday at 20:00 Eastern, reading the day in Pacific', () => {
      expect(
        occurrenceOnDayOf(
          TUE_THU_8PM,
          new Date('2026-07-17T05:00:00Z'),
          USTimeZones.PACIFIC,
        ),
      ).toEqual(new Date('2026-07-17T00:00:00Z'));
    });
  });

  describe('when it is asked for a Wednesday', () => {
    it('returns undefined', () => {
      expect(
        occurrenceOnDayOf(
          TUE_THU_8PM,
          new Date('2026-07-15T16:00:00Z'),
          USTimeZones.EASTERN,
        ),
      ).toBeUndefined();
    });
  });
});

describe('firstFreeOccurrence', () => {
  describe("when a Tue/Thu schedule's next two occurrences are held", () => {
    it('returns the one after them', () => {
      const held = new Set([
        Date.parse('2026-07-15T00:00:00Z'),
        Date.parse('2026-07-17T00:00:00Z'),
      ]);
      expect(
        firstFreeOccurrence(
          TUE_THU_8PM,
          new Date('2026-07-13T16:00:00Z'),
          held,
        ),
      ).toEqual(new Date('2026-07-22T00:00:00Z'));
    });
  });
});

describe('signupsCloseAt', () => {
  describe('when sign-ups close 2 hours before a start', () => {
    it('returns 2 hours before it', () => {
      expect(
        signupsCloseAt(
          { signupsCloseBeforeHours: 2 },
          new Date('2026-07-15T00:00:00Z'),
        ),
      ).toEqual(new Date('2026-07-14T22:00:00Z'));
    });
  });
});

describe('timeZoneLabel', () => {
  describe('when Eastern is labelled in July', () => {
    it('shows the daylight-saving offset', () => {
      expect(
        timeZoneLabel(USTimeZones.EASTERN, new Date('2026-07-15T12:00:00Z')),
      ).toEqual('Eastern (UTC−4)');
    });
  });

  describe('when Eastern is labelled in January', () => {
    it('shows the standard offset', () => {
      expect(
        timeZoneLabel(USTimeZones.EASTERN, new Date('2026-01-15T12:00:00Z')),
      ).toEqual('Eastern (UTC−5)');
    });
  });

  describe('when each other schedule zone is labelled in January', () => {
    it.each([
      [USTimeZones.CENTRAL, 'Central (UTC−6)'],
      [USTimeZones.MOUNTAIN, 'Mountain (UTC−7)'],
      [USTimeZones.PACIFIC, 'Pacific (UTC−8)'],
    ])('labels %s as %s', (zone, label) => {
      expect(timeZoneLabel(zone, new Date('2026-01-15T12:00:00Z'))).toEqual(
        label,
      );
    });
  });
});
