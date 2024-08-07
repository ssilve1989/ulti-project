import * as Sentry from '@sentry/node';
import { CronJob } from 'cron';

export function createJob(
  name: string,
  ...params: ConstructorParameters<typeof CronJob>
): CronJob {
  const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, name);
  return new CronJobWithCheckIn(...params) as CronJob;
}
