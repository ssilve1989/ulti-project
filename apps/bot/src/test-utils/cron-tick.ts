import { CronJob } from 'cron';
import { type MockInstance, vi } from 'vitest';
import { fresh } from './fixtures.js';

/** The spies `spiedCron` puts on cron. */
export interface SpiedCron {
  from: MockInstance<typeof CronJob.from>;
  start: MockInstance<CronJob['start']>;
}

/**
 * A fixture (for `test.extend`) that spies `CronJob.from` and makes `start` do
 * nothing. Make the app's fixture depend on it, so the spy sees the jobs built
 * at boot: `runTick(cron.from)` then runs a tick, and cron never schedules a
 * real one that could fire mid-test.
 */
export const spiedCron = () =>
  fresh<SpiedCron>(
    () => ({
      start: vi
        .spyOn(CronJob.prototype, 'start')
        .mockImplementation(() => undefined),
      from: vi.spyOn(CronJob, 'from'),
    }),
    ({ start, from }) => {
      start.mockRestore();
      from.mockRestore();
    },
  );

/**
 * Runs the `onTick` most recently handed to a spied `CronJob.from`. For a job
 * built by `createJob` that is the Sentry-monitored wrapper — exactly what cron
 * awaits on each tick — so its outcome is what the cron monitor records.
 */
export async function runTick(
  cronFrom: MockInstance<typeof CronJob.from>,
): Promise<void> {
  const onTick = cronFrom.mock.lastCall?.[0].onTick;
  if (typeof onTick !== 'function') {
    throw new Error('CronJob.from was not called with an onTick callback');
  }
  await onTick.call(cronFrom.mock.results.at(-1)?.value, () => undefined);
}

/** Whether `promise` has settled once queued work has had a macrotask to run. */
export function settledState(
  promise: Promise<unknown>,
): Promise<'settled' | 'pending'> {
  const settled = (): 'settled' => 'settled';
  return Promise.race([
    promise.then(settled, settled),
    new Promise<'pending'>((resolve) => {
      setTimeout(() => resolve('pending'), 0);
    }),
  ]);
}
