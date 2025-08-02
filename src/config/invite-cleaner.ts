import { z } from 'zod';

const inviteCleanerSchema = z.object({
  INVITE_CLEANER_CONCURRENCY: z.coerce.number().default(5),
});

export const inviteCleanerConfig = inviteCleanerSchema.parse(process.env);
export type InviteCleanerConfig = typeof inviteCleanerConfig;
