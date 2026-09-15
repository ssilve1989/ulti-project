import { Encounter } from '@ulti-project/shared';
import { z } from 'zod';

export const editSignupSchema = z.object({
  discordId: z.string().min(1),
  encounter: z.enum(Encounter),
});
