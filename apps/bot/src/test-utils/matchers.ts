import { Timestamp } from 'firebase-admin/firestore';

/** Vitest treats any object with `asymmetricMatch` as a matcher inside `toEqual`. */
interface Matcher {
  asymmetricMatch: (actual: unknown) => boolean;
  toString: () => string;
}

const plus28Days = (epochMilliseconds: number) =>
  Temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .add({ days: 28 }).epochMilliseconds;

/**
 * Matches when an upserted signup expires: the Timestamp 28 days (in the local
 * time zone) after a moment between `from` and `to`.
 */
export function signupExpiryFor(from: number, to = Date.now()): Matcher {
  return {
    asymmetricMatch: (actual) =>
      actual instanceof Timestamp &&
      actual.toMillis() >= plus28Days(from) &&
      actual.toMillis() <= plus28Days(to),
    toString: () =>
      `Timestamp 28 days after ${new Date(from).toISOString()}..${new Date(to).toISOString()}`,
  };
}

/** Matches an ISO date string (an embed timestamp) no earlier than `from`. */
export function isoDateSince(from: number): Matcher {
  return {
    asymmetricMatch: (actual) => {
      if (typeof actual !== 'string') return false;
      const time = Date.parse(actual);
      return time >= from && time <= Date.now();
    },
    toString: () => `ISO date since ${new Date(from).toISOString()}`,
  };
}

/** Matches a Timestamp from between `from` and `to` (epoch ms). */
export function timestampBetween(from: number, to: number): Matcher {
  return {
    asymmetricMatch: (actual) =>
      actual instanceof Timestamp &&
      actual.toMillis() >= from &&
      actual.toMillis() <= to,
    toString: () =>
      `Timestamp between ${new Date(from).toISOString()} and ${new Date(to).toISOString()}`,
  };
}
