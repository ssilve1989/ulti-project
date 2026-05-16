import { describe, expect, it } from 'vitest';
import {
  formatDiscordTimestamp,
  getNextOccurrence,
  isValidTime,
} from './helper-team-time.js';

describe('isValidTime', () => {
  it('accepts valid 24h times', () => {
    expect(isValidTime('19:30')).toBe(true);
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });

  it('rejects invalid times', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:30')).toBe(false);
    expect(isValidTime('19:60')).toBe(false);
    expect(isValidTime('not-a-time')).toBe(false);
  });
});

describe('formatDiscordTimestamp', () => {
  it('formats with f style', () => {
    const time = Temporal.Instant.fromEpochMilliseconds(1767225600000);
    expect(formatDiscordTimestamp(time, 'f')).toBe('<t:1767225600:f>');
  });

  it('formats with R style', () => {
    const time = Temporal.Instant.fromEpochMilliseconds(1767225600000);
    expect(formatDiscordTimestamp(time, 'R')).toBe('<t:1767225600:R>');
  });
});

describe('getNextOccurrence', () => {
  it('returns the next Friday occurrence when it is Thursday in America/Denver', () => {
    // 2026-05-14 18:00 UTC = Thursday 12:00 America/Denver
    const now = Temporal.Instant.from('2026-05-14T18:00:00Z');
    const occurrence = getNextOccurrence({
      dayOfWeek: 5, // Friday
      startTime: '20:00',
      durationMinutes: 120,
      timezone: 'America/Denver',
      now,
    });

    // In America/Denver, next Friday 20:00 MDT (UTC-6) = 2026-05-16 02:00 UTC
    expect(occurrence.start.toString()).toBe('2026-05-16T02:00:00Z');
    expect(occurrence.unixSeconds).toBe(
      Temporal.Instant.from('2026-05-16T02:00:00Z').epochMilliseconds / 1000,
    );
  });

  it('returns occurrence with default session and team ids', () => {
    const occurrence = getNextOccurrence({
      dayOfWeek: 3,
      startTime: '19:00',
      durationMinutes: 60,
      timezone: 'America/New_York',
      now: Temporal.Instant.from('2026-05-14T00:00:00Z'),
    });

    expect(occurrence.sessionId).toBe('session');
    expect(occurrence.teamId).toBe('team');
  });

  it('uses provided sessionId and teamId', () => {
    const occurrence = getNextOccurrence({
      dayOfWeek: 1,
      startTime: '18:00',
      durationMinutes: 90,
      timezone: 'America/Denver',
      now: Temporal.Instant.from('2026-05-14T00:00:00Z'),
      sessionId: 'my-session',
      teamId: 'my-team',
    });

    expect(occurrence.sessionId).toBe('my-session');
    expect(occurrence.teamId).toBe('my-team');
  });

  it('handles DST transition (Fall Back)', () => {
    // America/Denver DST ends 2026-11-01 02:00
    // Sat Oct 31 2026 20:00 MDT (UTC-6) -> Sun Nov 01 2026 02:00 UTC
    // Sun Nov 01 2026 20:00 MST (UTC-7) -> Mon Nov 02 2026 03:00 UTC

    const now = Temporal.Instant.from('2026-10-31T18:00:00Z'); // Sat morning
    const occurrence = getNextOccurrence({
      dayOfWeek: 7, // Sunday
      startTime: '20:00',
      durationMinutes: 60,
      timezone: 'America/Denver',
      now,
    });

    expect(occurrence.start.toString()).toBe('2026-11-02T03:00:00Z'); // Corrected for MST
  });
});
