import { describe, expect, it } from 'vitest';
import { parseTimeOfDay } from './time-of-day.js';

describe('parseTimeOfDay', () => {
  describe('when given a time an organizer might type', () => {
    it.each([
      ['20:00', '20:00'],
      ['8pm', '20:00'],
      ['8 PM', '20:00'],
      ['8:30pm', '20:30'],
      ['8:30 pm', '20:30'],
      ['08:05', '08:05'],
      ['9am', '09:00'],
      ['12am', '00:00'],
      ['12pm', '12:00'],
      [' 0:00 ', '00:00'],
    ])('reads %j as %s', (input, expected) => {
      expect(parseTimeOfDay(input)).toEqual(expected);
    });
  });

  describe('when given something that is not a time of day', () => {
    it.each(['25:00', '8:60', '13pm', '0pm', 'noon', '', '20', '8:5pm'])(
      'rejects %j',
      (input) => {
        expect(parseTimeOfDay(input)).toBeUndefined();
      },
    );
  });
});
