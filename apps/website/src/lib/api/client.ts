import { createSchedulingApi } from './index.js';

// Single API instance for the deployed guild
// Guild ID is configured via environment variables at build time
export const api = createSchedulingApi();