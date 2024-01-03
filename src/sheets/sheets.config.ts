import { registerAs } from '@nestjs/config';
import Joi from 'joi';

export interface SheetsConfig {
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SPREADSHEET_ID: string;
  GOOGLE_UNIVERSE_DOMAIN: string;
}

const schema = Joi.object({
  GOOGLE_PRIVATE_KEY: Joi.string().required(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: Joi.string().required(),
  GOOGLE_SPREADSHEET_ID: Joi.string().required(),
  GOOGLE_UNIVERSE_DOMAIN: Joi.string().default('googleapis.com'),
});

export const sheetsConfig = registerAs<SheetsConfig>('sheets', () => {
  const res = schema.validate(process.env, { stripUnknown: true });
  if (res.error) throw res.error;
  return res.value;
});
