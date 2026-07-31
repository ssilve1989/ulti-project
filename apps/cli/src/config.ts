import * as clack from '@clack/prompts';
import { createFirestore } from '@ulti-project/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

const cliConfigSchema = z.object({
  GCP_ACCOUNT_EMAIL: z.string(),
  GCP_PRIVATE_KEY: z.string(),
  GCP_PROJECT_ID: z.string(),
  FIRESTORE_DATABASE_ID: z.string().optional(),
  FFLOGS_API_ACCESS_TOKEN: z.string().optional(),
  GUILD_ID: z.string().optional(),
});

export interface CliContext {
  db: Firestore;
  fflogsToken: string | undefined;
  guildId: string;
}

// Initialized by main.ts preAction hook before any command action runs.
export let ctx!: CliContext;

export function initCtx(guildOverride?: string): void {
  const result = cliConfigSchema.safeParse(process.env);
  if (!result.success) {
    clack.log.error(
      `Missing required environment variables:\n${result.error.message}`,
    );
    process.exit(1);
  }
  const config = result.data;

  const guildId = guildOverride ?? config.GUILD_ID;
  if (!guildId) {
    clack.log.error(
      'No guild selected. Pass --guild <guildId> or set GUILD_ID in your env file.',
    );
    process.exit(1);
  }

  const db = createFirestore({
    clientEmail: config.GCP_ACCOUNT_EMAIL,
    privateKey: config.GCP_PRIVATE_KEY,
    projectId: config.GCP_PROJECT_ID,
    databaseId: config.FIRESTORE_DATABASE_ID,
    appName: 'cli',
  });
  ctx = { db, fflogsToken: config.FFLOGS_API_ACCESS_TOKEN, guildId };
}
