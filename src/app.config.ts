import Joi from 'joi';

export interface AppConfig {
  CLIENT_ID: string;
  DISCORD_TOKEN: string;
  GUILD_ID: string;
  PORT: number;
  PUBLIC_KEY: string;
}

export const configSchema = Joi.object({
  CLIENT_ID: Joi.string().optional(),
  DISCORD_TOKEN: Joi.string().required(),
  GUILD_ID: Joi.string().optional(),
  PORT: Joi.number().default(3000),
  PUBLIC_KEY: Joi.string().optional(),
});
