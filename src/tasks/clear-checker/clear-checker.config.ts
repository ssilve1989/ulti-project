import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  CLEAR_CHECKER_MODE: z.enum(['report', 'execute']).default('report'),
});

export type ClearCheckerConfig = z.infer<typeof schema>;

export const clearCheckerConfig = registerAs<ClearCheckerConfig>(
  'clear-checker',
  () => schema.parse(process.env),
);
