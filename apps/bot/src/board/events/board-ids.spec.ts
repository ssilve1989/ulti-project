import { describe, expect, it } from 'vitest';
import { isEventId, isParticipantId } from './board-ids.js';

describe('isEventId', () => {
  it.each([
    'Xq3vB9kLmN2pR7tY5wZa',
    // the scheduler's `${scheduleId}-${start in seconds}`
    'Xq3vB9kLmN2pR7tY5wZa-1791403200',
    'a'.repeat(128),
  ])('accepts %s', (id) => {
    expect(isEventId(id)).toBe(true);
  });

  it.each([
    '',
    '.',
    '..',
    'roster/night',
    '__name__',
    'roster night',
    'a'.repeat(129),
  ])('refuses %j', (id) => {
    expect(isEventId(id)).toBe(false);
  });
});

describe('isParticipantId', () => {
  it.each(['111111111111111111-FRU', '12345678901234567890-UCOB'])(
    'accepts %s',
    (id) => {
      expect(isParticipantId(id)).toBe(true);
    },
  );

  it.each([
    '',
    '..',
    '111111111111111111',
    '111111111111111111-',
    '111111111111111111-NOPE',
    '111111111111111111-FRU-FRU',
    '111111111111111111-fru',
    '1111-FRU',
    'alice-FRU',
    '111111111111111111/FRU',
  ])('refuses %j', (id) => {
    expect(isParticipantId(id)).toBe(false);
  });
});
