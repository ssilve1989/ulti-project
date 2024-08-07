import { z } from 'zod';

export type ApplicationMode = 'savage' | 'ultimate' | 'savage+ultimate';

export const configSchema = z.object({
  APPLICATION_MODE: z
    .enum(['savage', 'ultimate', 'savage+ultimate'])
    .default('ultimate'),
  CLIENT_ID: z.string(),
  DISCORD_TOKEN: z.string(),
  DISCORD_REFRESH_COMMANDS: z.coerce.boolean().default(false),
  FFLOGS_API_ACCESS_TOKEN: z.string().optional(),
  GCP_PRIVATE_KEY: z.string(),
  GCP_ACCOUNT_EMAIL: z.string(),
  GCP_PROJECT_ID: z.string(),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'silent', 'fatal'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export type AppConfig = z.infer<typeof configSchema>;
