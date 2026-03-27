import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { createFirestore } from '../firebase/create-firestore.js';

const cliConfigSchema = z.object({
  GCP_ACCOUNT_EMAIL: z.string(),
  GCP_PRIVATE_KEY: z.string(),
  GCP_PROJECT_ID: z.string(),
  FIRESTORE_DATABASE_ID: z.string().optional(),
  FFLOGS_API_ACCESS_TOKEN: z.string().optional(),
});

export interface CliContext {
  db: Firestore;
  fflogsToken: string | undefined;
}

export function createCliContext(): CliContext {
  const result = cliConfigSchema.safeParse(process.env);
  if (!result.success) {
    clack.log.error(
      `Missing required environment variables:\n${result.error.message}`,
    );
    process.exit(1);
  }
  const config = result.data;
  const db = createFirestore({
    clientEmail: config.GCP_ACCOUNT_EMAIL,
    privateKey: config.GCP_PRIVATE_KEY,
    projectId: config.GCP_PROJECT_ID,
    databaseId: config.FIRESTORE_DATABASE_ID,
    appName: 'cli',
  });
  return { db, fflogsToken: config.FFLOGS_API_ACCESS_TOKEN };
}
