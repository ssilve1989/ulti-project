import type { SignupDocument } from '@ulti-project/shared';
import { Encounter } from '@ulti-project/shared';
import { z } from 'zod';

export const turboProgSignupSchema = z.object({
  encounter: z.enum(Encounter),
}) satisfies z.Schema<Pick<SignupDocument, 'encounter'>>;

export type TurboProgSignupSchema = z.infer<typeof turboProgSignupSchema>;
