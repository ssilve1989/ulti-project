import Joi from 'joi';

export type ApplicationMode = 'savage' | 'ultimate' | 'savage+ultimate';

export interface AppConfig {
  APPLICATION_MODE: ApplicationMode;
  CLIENT_ID: string;
  DISCORD_TOKEN: string;
  DISCORD_REFRESH_COMMANDS: boolean;
  GCP_PRIVATE_KEY: string;
  GCP_ACCOUNT_EMAIL: string;
  GCP_PROJECT_ID: string;
  LOG_LEVEL: string;
  NODE_ENV: string;
  PORT: number;
  PUBLIC_KEY: string;
}

export const configSchema = Joi.object({
  APPLICATION_MODE: Joi.string()
    .valid('savage', 'ultimate', 'savage+ultimate')
    .trim()
    .default('ultimate'),
  CLIENT_ID: Joi.string().optional(),
  DISCORD_TOKEN: Joi.string().required(),
  DISCORD_REFRESH_COMMANDS: Joi.bool().default(false),
  GCP_PRIVATE_KEY: Joi.string().required(),
  GCP_ACCOUNT_EMAIL: Joi.string().required(),
  GCP_PROJECT_ID: Joi.string().required(),
  LOG_LEVEL: Joi.string()
    .allow('debug', 'info', 'warn', 'error', 'silent', 'fatal')
    .default('info'),
  NODE_ENV: Joi.string()
    .allow('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  PUBLIC_KEY: Joi.string().optional(),
});
