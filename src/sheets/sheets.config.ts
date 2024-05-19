import { registerAs } from '@nestjs/config';
import Joi from 'joi';

export interface SheetsConfig {
  GOOGLE_APIS_HTTP2: boolean;
  GOOGLE_UNIVERSE_DOMAIN: string;
  SHEET_EARLY_PROG_NAME: string;
  SHEET_PROG_NAME: string;
  TURBO_PROG_SHEET_NAME: string;
}

const schema = Joi.object({
  // https://github.com/googleapis/google-api-nodejs-client/issues/3187
  // http2 + timeout maybe doesn't work well? We seem to be getting a lot more hanging requests
  // since this was turned on.
  GOOGLE_APIS_HTTP2: Joi.boolean().default(false),
  GOOGLE_UNIVERSE_DOMAIN: Joi.string().default('googleapis.com'),
  SHEET_EARLY_PROG_NAME: Joi.string().default('EARLY PROG (Season 4)'),
  SHEET_PROG_NAME: Joi.string().default('MID/LATE PROG (Season 4)'),
  TURBO_PROG_SHEET_NAME: Joi.string().default('Bot'),
});

export const sheetsConfig = registerAs<SheetsConfig>('sheets', () => {
  const res = schema.validate(process.env, { stripUnknown: true });
  if (res.error) throw res.error;
  return res.value;
});
