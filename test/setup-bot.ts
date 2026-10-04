import { initTestSentry } from '../apps/bot/src/test-utils/sentry.js';

// A real Sentry client, so the bot's scopes behave in tests as they do in
// production (see initTestSentry).
initTestSentry();
