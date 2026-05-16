import type { HelperTeamSessionDocument } from '../firebase/models/helper-team.model.js';

export interface SessionOccurrence {
  sessionId: string;
  teamId: string;
  start: Temporal.Instant;
  end: Temporal.Instant;
  unixSeconds: number;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function formatDiscordTimestamp(
  time: number | Temporal.Instant,
  style: 'f' | 'R',
) {
  const unixSeconds =
    typeof time === 'number' ? time : Math.floor(time.epochMilliseconds / 1000);
  return `<t:${unixSeconds}:${style}>`;
}

export function getNextOccurrence({
  dayOfWeek,
  startTime,
  durationMinutes,
  timezone,
  now,
  sessionId = 'session',
  teamId = 'team',
}: Pick<
  HelperTeamSessionDocument,
  'dayOfWeek' | 'startTime' | 'durationMinutes' | 'timezone'
> & {
  now: Temporal.Instant;
  sessionId?: string;
  teamId?: string;
}): SessionOccurrence {
  const [hour, minute] = startTime.split(':').map(Number);

  const nowZoned = now.toZonedDateTimeISO(timezone);

  // Find the next occurrence of the dayOfWeek (1=Mon, 7=Sun)
  let occurrence = nowZoned.with({
    hour,
    minute,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });

  // Calculate days to add (Temporal.ZonedDateTime.dayOfWeek is 1-7)
  const daysDiff = (dayOfWeek - occurrence.dayOfWeek + 7) % 7;
  occurrence = occurrence.add({ days: daysDiff });

  // If the occurrence is in the past (or exactly now), move to next week
  if (Temporal.Instant.compare(occurrence.toInstant(), now) <= 0) {
    occurrence = occurrence.add({ weeks: 1 });
  }

  const start = occurrence.toInstant();
  const end = occurrence.add({ minutes: durationMinutes }).toInstant();

  return {
    sessionId,
    teamId,
    start,
    end,
    unixSeconds: Math.floor(start.epochMilliseconds / 1000),
  };
}
