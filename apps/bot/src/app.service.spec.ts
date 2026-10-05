import { CqrsModule, UnhandledExceptionBus } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { test as base, describe, expect, vi } from 'vitest';
import { AppService } from './app.service.js';
import { ErrorModule } from './error/error.module.js';
import { fresh } from './test-utils/fixtures.js';

class SignupReviewedEvent {
  constructor(readonly signupId: string) {}
}

type ScopeData = ReturnType<Sentry.Scope['getScopeData']>;

interface SentryReport {
  exception: unknown;
  tags: ScopeData['tags'];
  extra: ScopeData['extra'];
}

/** Records each exception sent to Sentry with the scope it was sent on. */
function watchSentryReports() {
  const { captureException } = Sentry.Scope.prototype;
  const reports: SentryReport[] = [];
  const spy = vi
    .spyOn(Sentry.Scope.prototype, 'captureException')
    .mockImplementation(function (this: Sentry.Scope, ...args) {
      const { tags, extra } = this.getScopeData();
      reports.push({ exception: args[0], tags, extra });
      return Reflect.apply(captureException, this, args);
    });
  return { reports, restore: () => spy.mockRestore() };
}

/**
 * Runs `callback` with an empty scope as the current one, so a test sees only
 * what it put there: specs share Sentry's default scope (`isolate: false`), and
 * some leave extras on it.
 */
function withCleanScope<T>(callback: (scope: Sentry.Scope) => T): T {
  return Sentry.withScope(new Sentry.Scope(), callback);
}

const it = base.extend<{
  app: TestingModule;
  sentry: ReturnType<typeof watchSentryReports>;
}>({
  app: fresh(
    () =>
      Test.createTestingModule({
        imports: [CqrsModule, ErrorModule],
        providers: [AppService],
      }).compile(),
    (app) => app.close(),
  ),
  sentry: fresh(watchSentryReports, ({ restore }) => restore()),
});

// CQRS publishes to the UnhandledExceptionBus from the async context of the
// code that published the failing event, so publishing directly from inside a
// scope stands in for it.
describe('when an event handler throws', () => {
  it('reports it on the scope that published the event, with the event attached', ({
    app,
    sentry,
  }) => {
    const event = new SignupReviewedEvent('signup-1');
    const exception = new Error('handler failed');

    withCleanScope((scope) => {
      scope.setTag('command', 'signup');
      app.get(UnhandledExceptionBus).publish({ cause: event, exception });
    });

    expect(sentry.reports).toEqual([
      { exception, tags: { command: 'signup' }, extra: { cause: event } },
    ]);
  });

  it('leaves the event off the publishing scope', ({ app }) => {
    const publishingScope = withCleanScope((scope) => {
      app.get(UnhandledExceptionBus).publish({
        cause: new SignupReviewedEvent('signup-1'),
        exception: new Error('handler failed'),
      });
      return scope;
    });

    expect(publishingScope.getScopeData().extra).toEqual({});
  });
});
