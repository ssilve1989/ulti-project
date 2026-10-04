import * as Sentry from '@sentry/nestjs';

/**
 * Runs `callback` as its own unit of work for Sentry (a command, a reaction, a
 * cron tick): a fresh isolation scope, so breadcrumbs from concurrent work
 * don't mix into its reports, and a new trace. Sentry only does this by itself
 * around HTTP requests, which the bot doesn't serve.
 */
export function withUnitOfWork<T>(callback: () => T): T {
  return Sentry.withIsolationScope(() => Sentry.startNewTrace(callback));
}
