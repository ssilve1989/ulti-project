// This file is ONLY for the CLI.

// Side Effect: Loads .env into process.env for this script's execution.
import 'dotenv/config';

import { betterAuth } from 'better-auth';
import { getBetterAuthConfig } from '../api/auth/auth.config.js';

// Create and export an instance for the CLI tool to consume.
const {
  CLIENT_ID,
  DISCORD_OAUTH_TOKEN,
  BETTER_AUTH_SECRET,
  BETTER_AUTH_BASE_URL,
} = process.env;

export const auth = betterAuth(
  getBetterAuthConfig({
    clientId: CLIENT_ID!,
    clientSecret: DISCORD_OAUTH_TOKEN!,
    betterAuthSecret: BETTER_AUTH_SECRET!,
    baseURL: BETTER_AUTH_BASE_URL!,
  }),
);
