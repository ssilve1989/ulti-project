import { registerAs } from '@nestjs/config';
import Joi from 'joi';

export interface SheetsConfig {
  GOOGLE_APIS_HTTP2: boolean;
  GOOGLE_UNIVERSE_DOMAIN: string;
  SHEET_EARLY_PROG_NAME: string;
  SHEET_PROG_NAME: string;
}

const schema = Joi.object({
  GOOGLE_APIS_HTTP2: Joi.boolean().default(true),
  GOOGLE_UNIVERSE_DOMAIN: Joi.string().default('googleapis.com'),
  SHEET_EARLY_PROG_NAME: Joi.string().default('EARLY PROG (Season 4)'),
  SHEET_PROG_NAME: Joi.string().default('MID/LATE PROG (Season 4)'),
});

export const sheetsConfig = registerAs<SheetsConfig>('sheets', () => {
  const res = schema.validate(process.env, { stripUnknown: true });
  if (res.error) throw res.error;
  return res.value;
});
