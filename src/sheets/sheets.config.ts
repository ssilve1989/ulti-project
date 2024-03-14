import { registerAs } from '@nestjs/config';
import Joi from 'joi';

export interface SheetsConfig {
  GOOGLE_UNIVERSE_DOMAIN: string;
  SHEET_PROG_NAME: string;
  SHEET_EARLY_PROG_NAME: string;
}

const schema = Joi.object({
  GOOGLE_UNIVERSE_DOMAIN: Joi.string().default('googleapis.com'),
  SHEET_PROG_NAME: Joi.string().default('MID/LATE PROG (Season 4)'),
  SHEET_EARLY_PROG_NAME: Joi.string().default('EARLY PROG (Season 4)'),
});

export const sheetsConfig = registerAs<SheetsConfig>('sheets', () => {
  const res = schema.validate(process.env, { stripUnknown: true });
  if (res.error) throw res.error;
  return res.value;
});
