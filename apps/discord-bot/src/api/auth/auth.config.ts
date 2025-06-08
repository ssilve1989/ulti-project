import path from 'node:path';
import type { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';

interface ConfigOptions {
  clientId: string;
  clientSecret: string;
  betterAuthSecret: string;
  baseURL: string;
}

export function getBetterAuthConfig({
  clientId,
  clientSecret,
  betterAuthSecret,
  baseURL,
}: ConfigOptions): Parameters<typeof betterAuth>[0] {
  const dbPath = path.join(process.cwd(), 'sqlite.db');

  console.log({
    baseURL,
    clientId,
    clientSecret,
    betterAuthSecret,
  });

  return {
    trustedOrigins: ['http://localhost:4321', 'http://localhost:3000'],
    secret: betterAuthSecret,
    database: new Database(dbPath),
    socialProviders: {
      discord: {
        clientId,
        clientSecret,
        redirectURI: `${baseURL}/api/auth/callback/discord`,
      },
    },
  };
}
