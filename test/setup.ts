import { vi } from 'vitest';
import { STAND_IN_GCP_PRIVATE_KEY } from './stand-in-gcp-key.js';

// Global test setup - stub required environment variables
vi.stubEnv('CLIENT_ID', 'test-client-id');
vi.stubEnv('DISCORD_TOKEN', 'test-discord-token');
vi.stubEnv('GCP_PROJECT_ID', 'test-project-id');
vi.stubEnv('APPLICATION_MODE', 'ultimate');
vi.stubEnv('LOG_LEVEL', 'info');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('DISCORD_REFRESH_COMMANDS', 'false');

// Sheets config
vi.stubEnv('TURBO_PROG_SHEET_NAME', 'TurboProg');
vi.stubEnv('GOOGLE_APIS_HTTP2', 'false');
vi.stubEnv('GOOGLE_UNIVERSE_DOMAIN', 'googleapis.com');

// Job configs
vi.stubEnv('CLEAR_CHECKER_CONCURRENCY', '5');
vi.stubEnv('INVITE_CLEANER_CONCURRENCY', '5');

// Firebase config
vi.stubEnv('FIRESTORE_DATABASE_ID', 'test-db');

// Optional configs
vi.stubEnv('FFLOGS_API_ACCESS_TOKEN', 'test-fflogs-token');

// Google credentials: flow specs replay recorded Sheets traffic, so a normal
// run never needs (or sees) the real service account. Only a recording run
// (NOCK_BACK_MODE=update, `pnpm test:record`) uses the real one from the env.
if (process.env.NOCK_BACK_MODE !== 'update') {
  vi.stubEnv('GCP_ACCOUNT_EMAIL', 'flow-tests@example.iam.gserviceaccount.com');
  vi.stubEnv('GCP_PRIVATE_KEY', STAND_IN_GCP_PRIVATE_KEY);
}
