import { z } from 'zod';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';

export const turboProgSignupSchema = z.object({
  availability: z.string().min(1),
  encounter: z.enum(Encounter),
}) satisfies z.Schema<Pick<SignupDocument, 'encounter' | 'availability'>>;

export type TurboProgSignupSchema = z.infer<typeof turboProgSignupSchema>;
