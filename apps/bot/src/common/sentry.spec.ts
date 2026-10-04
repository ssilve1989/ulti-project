import * as Sentry from '@sentry/nestjs';
import { test as base, describe, expect } from 'vitest';
import { fresh } from '../test-utils/fixtures.js';
import { watchSentryEvents } from '../test-utils/sentry.js';
import { withUnitOfWork } from './sentry.js';

interface Report {
  message: string | undefined;
  breadcrumbs: (string | undefined)[];
  traceId: string | undefined;
}

function watchReports() {
  const reports: Report[] = [];
  const stop = watchSentryEvents((event) => {
    reports.push({
      message: event.message,
      breadcrumbs: (event.breadcrumbs ?? []).map((crumb) => crumb.message),
      traceId: event.contexts?.trace?.trace_id,
    });
  });
  return { reports, stop };
}

const it = base.extend<{ sentry: ReturnType<typeof watchReports> }>({
  sentry: fresh(watchReports, ({ stop }) => stop()),
});

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('when two units of work start at the same time', () => {
  it('reports each with only its own breadcrumbs, in its own trace', async ({
    sentry,
  }) => {
    // started inside someone else's trace (as Sentry's cron monitor does)
    const outerTraceId = await Sentry.startSpan({ name: 'outer' }, (span) =>
      Promise.all([
        withUnitOfWork(async () => {
          Sentry.addBreadcrumb({ message: 'first unit' });
          await nextTurn();
          Sentry.captureMessage('first failed');
        }),
        withUnitOfWork(async () => {
          Sentry.addBreadcrumb({ message: 'second unit' });
          await nextTurn();
          Sentry.captureMessage('second failed');
        }),
      ]).then(() => span.spanContext().traceId),
    );
    await Sentry.flush();

    const traceIds = new Set([
      outerTraceId,
      ...sentry.reports.map(({ traceId }) => traceId),
    ]);
    expect(sentry.reports).toEqual([
      {
        message: 'first failed',
        breadcrumbs: ['first unit'],
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      },
      {
        message: 'second failed',
        breadcrumbs: ['second unit'],
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      },
    ]);
    expect(traceIds.size).toBe(3);
  });
});
