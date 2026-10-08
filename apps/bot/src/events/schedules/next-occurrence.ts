import { USTimeZones } from '../../common/time-zones.js';

export const Weekdays = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;
export type Weekday = (typeof Weekdays)[number];

export const SCHEDULE_TIME_ZONES = [
  USTimeZones.EASTERN,
  USTimeZones.CENTRAL,
  USTimeZones.MOUNTAIN,
  USTimeZones.PACIFIC,
] as const;
export type ScheduleTimeZone = (typeof SCHEDULE_TIME_ZONES)[number];

export interface Recurrence {
  weekdays: readonly Weekday[];
  /** `HH:mm`, as `parseTimeOfDay` returns it. */
  startTime: string;
  timeZone: ScheduleTimeZone;
}

export const ZONE_NAMES: Record<ScheduleTimeZone, string> = {
  [USTimeZones.EASTERN]: 'Eastern',
  [USTimeZones.CENTRAL]: 'Central',
  [USTimeZones.MOUNTAIN]: 'Mountain',
  [USTimeZones.PACIFIC]: 'Pacific',
};

const NANOSECONDS_PER_HOUR = 3_600_000_000_000;
const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * The first `weekday + startTime` in `timeZone` strictly after `after`. A local
 * time skipped by spring-forward moves later and an ambiguous one takes the
 * earlier offset (Temporal's `compatible`).
 */
export function nextOccurrence(recurrence: Recurrence, after: Date): Date {
  const start = Temporal.Instant.fromEpochMilliseconds(
    after.getTime(),
  ).toZonedDateTimeISO(recurrence.timeZone);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = occurrenceOn(
      recurrence,
      start.toPlainDate().add({ days: offset }),
    );
    if (candidate && candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error('a recurrence must have at least one weekday');
}

/** The first occurrence strictly after `after` whose start (epoch ms) isn't in `held`. */
export function firstFreeOccurrence(
  recurrence: Recurrence,
  after: Date,
  held: ReadonlySet<number>,
): Date {
  let next = nextOccurrence(recurrence, after);
  while (held.has(next.getTime())) next = nextOccurrence(recurrence, next);
  return next;
}

/**
 * The occurrence on `start`'s date in `dayZone`, at the recurrence's
 * `startTime` in its own zone; undefined if that date's weekday isn't one of
 * its weekdays.
 */
export function occurrenceOnDayOf(
  recurrence: Recurrence,
  start: Date,
  dayZone: ScheduleTimeZone,
): Date | undefined {
  return occurrenceOn(
    recurrence,
    Temporal.Instant.fromEpochMilliseconds(start.getTime())
      .toZonedDateTimeISO(dayZone)
      .toPlainDate(),
  );
}

/** `startTime` on `day` in `timeZone`; undefined if `day` isn't one of the weekdays. */
function occurrenceOn(
  { weekdays, startTime, timeZone }: Recurrence,
  day: Temporal.PlainDate,
): Date | undefined {
  if (!weekdays.includes(Weekdays[day.dayOfWeek - 1])) return undefined;
  const [hour, minute] = startTime.split(':').map(Number);
  return new Date(
    day.toZonedDateTime({ timeZone, plainTime: { hour, minute } })
      .epochMilliseconds,
  );
}

/** When sign-ups close for an occurrence starting at `start`. */
export function signupsCloseAt(
  { signupsCloseBeforeHours }: { signupsCloseBeforeHours: number },
  start: Date,
): Date {
  return new Date(
    start.getTime() - signupsCloseBeforeHours * MILLISECONDS_PER_HOUR,
  );
}

/** `Eastern (UTC−4)`, with the zone's offset at `at`. */
export function timeZoneLabel(zone: ScheduleTimeZone, at: Date): string {
  const hours =
    Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(
      zone,
    ).offsetNanoseconds / NANOSECONDS_PER_HOUR;
  const sign = hours < 0 ? '−' : '+';
  return `${ZONE_NAMES[zone]} (UTC${sign}${Math.abs(hours)})`;
}
