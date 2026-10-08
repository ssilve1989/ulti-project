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

const ZONE_NAMES: Record<ScheduleTimeZone, string> = {
  [USTimeZones.EASTERN]: 'Eastern',
  [USTimeZones.CENTRAL]: 'Central',
  [USTimeZones.MOUNTAIN]: 'Mountain',
  [USTimeZones.PACIFIC]: 'Pacific',
};

const NANOSECONDS_PER_HOUR = 3_600_000_000_000;

/**
 * The first `weekday + startTime` in `timeZone` strictly after `after`. A local
 * time skipped by spring-forward moves later and an ambiguous one takes the
 * earlier offset (Temporal's `compatible`).
 */
export function nextOccurrence(
  { weekdays, startTime, timeZone }: Recurrence,
  after: Date,
): Date {
  const [hour, minute] = startTime.split(':').map(Number);
  const start = Temporal.Instant.fromEpochMilliseconds(
    after.getTime(),
  ).toZonedDateTimeISO(timeZone);
  for (let offset = 0; offset <= 7; offset++) {
    const day = start.toPlainDate().add({ days: offset });
    if (!weekdays.includes(Weekdays[day.dayOfWeek - 1])) continue;
    const candidate = day.toZonedDateTime({
      timeZone,
      plainTime: { hour, minute },
    });
    if (
      Temporal.Instant.compare(candidate.toInstant(), start.toInstant()) > 0
    ) {
      return new Date(candidate.epochMilliseconds);
    }
  }
  throw new Error('a recurrence must have at least one weekday');
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
