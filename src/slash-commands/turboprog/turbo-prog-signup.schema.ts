import { z } from 'zod/v4';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';

export const turboProgSignupSchema = z.object({
  availability: z.string().min(1),
  encounter: z.nativeEnum(Encounter),
}) satisfies z.Schema<Pick<SignupDocument, 'encounter' | 'availability'>>;

export type TurboProgSignupSchema = z.infer<typeof turboProgSignupSchema>;
