import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  CLEAR_CHECKER_MODE: z.enum(['report', 'execute', 'off']).default('off'),
  CLEAR_CHECKER_CONCURRENCY: z.number().default(5),
});

export type ClearCheckerConfig = z.infer<typeof schema>;

export const clearCheckerConfig = registerAs<ClearCheckerConfig>(
  'clear-checker',
  () => schema.parse(process.env),
);
