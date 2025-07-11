import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  CLEAR_CHECKER_CONCURRENCY: z.coerce.number().default(5),
});

export type ClearCheckerConfig = z.infer<typeof schema>;

export const clearCheckerConfig = registerAs<ClearCheckerConfig>(
  'clear-checker',
  () => schema.parse(process.env),
);
