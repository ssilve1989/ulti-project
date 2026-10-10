import * as Sentry from '@sentry/nestjs';

/**
 * Starts a Sentry client for this test worker, as instrumentation.ts does for
 * the bot, so scopes follow async work and event processors run as they do in
 * production. No integrations, and nothing leaves the process: the transport
 * drops every envelope.
 */
export function initTestSentry(): void {
  if (Sentry.getClient()) return;

  Sentry.init({
    dsn: 'https://public@sentry.invalid/0',
    defaultIntegrations: false,
    transport: (options) =>
      Sentry.createTransport(options, () => Promise.resolve({})),
  });
}

/**
 * Runs a test in forks of Sentry's isolation and current scopes, for
 * `aroundEach`: spec files share the scopes (isolate: false), so a user or
 * context one test sets never reaches the next's reports.
 */
export function inFreshSentryScopes(runTest: () => Promise<void>) {
  return Sentry.withIsolationScope(() => Sentry.withScope(() => runTest()));
}

/**
 * Calls `watch` with every event Sentry sends (after the scope's event
 * processors) until the returned function is called. Watchers live on the
 * client, which spec files share even when they re-evaluate this module.
 */
export function watchSentryEvents(
  watch: (event: Sentry.Event, hint: Sentry.EventHint | undefined) => void,
): () => void {
  const client = Sentry.getClient();
  if (!client) throw new Error('Sentry is not initialised (initTestSentry)');
  return client.on('beforeSendEvent', watch);
}

/** Whether Sentry adds this attribute to every metric itself (its SDK, the host). */
const isSdkAttribute = (key: string) =>
  key.startsWith('sentry.') || key === 'server.address';

/**
 * Calls `watch` with every metric the app records, as it passed it to
 * `Sentry.metrics` (without the attributes Sentry adds to each), until the
 * returned function is called.
 */
export function watchSentryMetrics(
  watch: (metric: Sentry.Metric) => void,
): () => void {
  const client = Sentry.getClient();
  if (!client) throw new Error('Sentry is not initialised (initTestSentry)');
  return client.on('processMetric', ({ attributes = {}, ...metric }) =>
    watch({
      ...metric,
      attributes: Object.fromEntries(
        Object.entries(attributes).filter(([key]) => !isSdkAttribute(key)),
      ),
    }),
  );
}
