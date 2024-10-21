import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  // https://github.com/googleapis/google-api-nodejs-client/issues/3187
  // http2 + timeout maybe doesn't work well? We seem to be getting a lot more hanging requests
  // since this was turned on.
  GOOGLE_APIS_HTTP2: z.boolean().default(false),
  GOOGLE_UNIVERSE_DOMAIN: z.string().default('googleapis.com'),
  TURBO_PROG_SHEET_NAME: z.string().default('Bot'),
});

export type SheetsConfig = z.infer<typeof schema>;

export const sheetsConfig = registerAs<SheetsConfig>('sheets', () =>
  schema.parse(process.env),
);
