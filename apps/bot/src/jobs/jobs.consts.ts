import * as Sentry from '@sentry/nestjs';
import { CronJob, type CronJobParams } from 'cron';
import { withUnitOfWork } from '#src/common/sentry.js';
import { USTimeZones } from '#src/common/time-zones.js';

// The jobs in this repo are all scheduled by time zone, never by UTC offset.
// `CronJobParams` is a union of a `timeZone` arm and a mutually exclusive
// `utcOffset` arm; pinning to the `timeZone` arm lets the defaults merge with a
// caller's params without an assertion.
type TimeZoneCronJobParams = Extract<CronJobParams, { utcOffset?: never }>;

/** A job's params; its tick is always a function, so it can be wrapped. */
type JobParams = Omit<TimeZoneCronJobParams, 'onTick'> & {
  onTick: () => Promise<void>;
};

const DEFAULT_JOB_OPTIONS: Partial<TimeZoneCronJobParams> = {
  timeZone: USTimeZones.PACIFIC,
  start: false,
  waitForCompletion: true,
};

/**
 * Creates a Sentry compatible cron job
 * @param name
 * @param params
 * @returns
 */
export function createJob(
  name: JobType,
  { onTick, ...params }: JobParams,
): CronJob {
  const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, name);
  const options: TimeZoneCronJobParams = {
    ...DEFAULT_JOB_OPTIONS,
    ...params,
    // Sentry's monitor runs every tick in the process's trace; give each run
    // its own, and its own breadcrumbs
    onTick: () => withUnitOfWork(onTick),
  };
  return CronJobWithCheckIn.from(options);
}

export const jobDateFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: USTimeZones.PACIFIC,
  timeZoneName: 'short',
});

export type JobType = 'clear-checker' | 'sheet-cleaner' | 'invite-cleaner';
