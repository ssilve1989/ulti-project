import * as Sentry from '@sentry/node';
import { CronJob, type CronJobParams } from 'cron';
import { USTimeZones } from '../common/time-zones.js';

const DEFAULT_JOB_OPTIONS: Partial<CronJobParams> = {
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
export function createJob(name: JobType, params: CronJobParams): CronJob {
  const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, name);
  return CronJobWithCheckIn.from({
    ...DEFAULT_JOB_OPTIONS,
    ...params,
  } as CronJobParams);
}

export const jobDateFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: USTimeZones.PACIFIC,
  timeZoneName: 'short',
});

export type JobType = 'clear-checker' | 'sheet-cleaner' | 'invite-cleaner';
