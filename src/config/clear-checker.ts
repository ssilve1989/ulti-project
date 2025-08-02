import { z } from 'zod';

const clearCheckerSchema = z.object({
  CLEAR_CHECKER_CONCURRENCY: z.coerce.number().default(5),
});

export const clearCheckerConfig = clearCheckerSchema.parse(process.env);
export type ClearCheckerConfig = z.infer<typeof clearCheckerSchema>;
