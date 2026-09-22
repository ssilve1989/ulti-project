import type { CronJob } from 'cron';
import type { MockInstance } from 'vitest';

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
