import { z } from 'zod';

const APPLICATION_MODES = ['savage', 'ultimate', 'legacy'] as const;
export type ApplicationMode = (typeof APPLICATION_MODES)[number];

export const appSchema = z.object({
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
  CLIENT_ID: z.string(),
  DISCORD_TOKEN: z.string(),
  DISCORD_REFRESH_COMMANDS: z.coerce.boolean().default(false),
  FFLOGS_API_ACCESS_TOKEN: z.string().optional(),
  GCP_PRIVATE_KEY: z.string(),
  GCP_ACCOUNT_EMAIL: z.string(),
  GCP_PROJECT_ID: z.string(),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'silent', 'fatal'] as const)
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'] as const)
    .default('development'),
});

export const appConfig = appSchema.parse(process.env);
export type AppConfig = typeof appConfig;
export type ApplicationModeConfig = typeof appConfig.APPLICATION_MODE;
