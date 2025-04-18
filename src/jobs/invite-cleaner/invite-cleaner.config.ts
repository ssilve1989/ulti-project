import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  INVITE_CLEANER_CONCURRENCY: z.number().default(5),
});

export type InviteCleanerConfig = z.infer<typeof schema>;

export const inviteCleanerConfig = registerAs<InviteCleanerConfig>(
  'invite-cleaner',
  () => schema.parse(process.env),
);
