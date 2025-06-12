// @ts-check
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import pkg from './package.json' with { type: 'json' };

const { NODE_ENV = 'development', SENTRY_DEBUG, SENTRY_DSN } = process.env;

Sentry.init({
  debug: !!SENTRY_DEBUG,
  dsn: SENTRY_DSN,
  environment: NODE_ENV,
  integrations: [nodeProfilingIntegration()],
  profilesSampleRate: 1.0,
  release: `ulti-project-bot@${pkg.version}`,
  tracesSampleRate: 1.0,
});
