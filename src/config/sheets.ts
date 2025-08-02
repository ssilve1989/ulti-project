import { z } from 'zod';

const sheetsSchema = z.object({
  // https://github.com/googleapis/google-api-nodejs-client/issues/3187
  // http2 + timeout maybe doesn't work well? We seem to be getting a lot more hanging requests
  // since this was turned on.
  GOOGLE_APIS_HTTP2: z.coerce.boolean().default(false),
  GOOGLE_UNIVERSE_DOMAIN: z.string().default('googleapis.com'),
  TURBO_PROG_SHEET_NAME: z.string().default('Bot'),
});

export const sheetsConfig = sheetsSchema.parse(process.env);
export type SheetsConfig = typeof sheetsConfig;
