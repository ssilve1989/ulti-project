import { z } from 'zod/v4';

const APPLICATION_MODES = ['savage', 'ultimate', 'legacy'] as const;
export type ApplicationMode = (typeof APPLICATION_MODES)[number];

export const configSchema = z.object({
  APPLICATION_MODE: z
    .string()
    .transform((str) => str.split('+').map((s) => s.trim()))
    .pipe(
      z
        .array(z.enum(APPLICATION_MODES))
        .min(1)
        .refine(
          (modes) => new Set(modes).size === modes.length,
          'Duplicate modes are not allowed',
        ),
    )
    .default(['ultimate']),
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_BASE_URL: z.string().default('http://localhost:3000'),
  CLIENT_ID: z.string(),
  DISCORD_TOKEN: z.string(),
  DISCORD_OAUTH_TOKEN: z.string(),
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
export type ApplicationModeConfig = z.infer<
  typeof configSchema
>['APPLICATION_MODE'];
