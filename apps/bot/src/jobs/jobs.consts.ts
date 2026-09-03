import * as Sentry from '@sentry/nestjs';
import { CronJob, type CronJobParams } from 'cron';
import { USTimeZones } from '../common/time-zones.js';

// The jobs in this repo are all scheduled by time zone, never by UTC offset.
// `CronJobParams` is a union of a `timeZone` arm and a mutually exclusive
// `utcOffset` arm; pinning to the `timeZone` arm lets the defaults merge with a
// caller's params without an assertion.
type TimeZoneCronJobParams = Extract<CronJobParams, { utcOffset?: never }>;

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
  params: TimeZoneCronJobParams,
): CronJob {
  const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, name);
  const options: TimeZoneCronJobParams = { ...DEFAULT_JOB_OPTIONS, ...params };
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
