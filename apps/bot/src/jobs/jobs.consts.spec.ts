import * as Sentry from '@sentry/nestjs';
import { test as base, describe, expect } from 'vitest';
import { CronTime } from '#src/common/cron.js';
import { fresh } from '#src/test-utils/fixtures.js';
import { watchSentryEvents } from '#src/test-utils/sentry.js';
import { createJob } from './jobs.consts.js';

function watchTraceIds() {
  const traceIds: (string | undefined)[] = [];
  const stop = watchSentryEvents((event) => {
    traceIds.push(event.contexts?.trace?.trace_id);
  });
  return { traceIds, stop };
}

const it = base.extend<{ sentry: ReturnType<typeof watchTraceIds> }>({
  sentry: fresh(watchTraceIds, ({ stop }) => stop()),
});

describe('when a job runs', () => {
  it("reports each run in its own trace, apart from the process's", async ({
    sentry,
  }) => {
    const job = createJob('sheet-cleaner', {
      cronTime: CronTime.everyDay().at(3),
      onTick: () => {
        Sentry.captureMessage('run failed');
        return Promise.resolve();
      },
    });

    await job.fireOnTick();
    await job.fireOnTick();
    Sentry.captureMessage('failed outside any run');
    await Sentry.flush();

    expect(sentry.traceIds).toHaveLength(3);
    expect(new Set(sentry.traceIds).size).toBe(3);
  });
});
