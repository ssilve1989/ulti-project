import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';

/**
 * Creates a Sentry compatible cron job
 * @param name
 * @param params
 * @returns
 */
export function createJob(
  name: string,
  ...params: ConstructorParameters<typeof CronJob>
): CronJob {
  const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, name);
  return new CronJobWithCheckIn(...params) as CronJob;
}
