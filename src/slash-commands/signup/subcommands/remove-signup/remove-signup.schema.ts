import { z } from 'zod';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../../../firebase/models/signup.model.js';
import { NorthAmericanWorlds } from '../../../../worlds/consts.js';

export const removeSignupSchema = z.object({
  character: z
    .string()
    .min(1)
    .transform((str) => str.toLowerCase()),

  encounter: z.nativeEnum(Encounter),

  world: z
    .string()
    .transform((str) => str.toLowerCase())
    .refine(
      (val) => NorthAmericanWorlds.has(val),
      'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
    ),
}) satisfies z.Schema<
  Pick<SignupDocument, 'character' | 'world' | 'encounter'>
>;

export type RemoveSignupSchema = z.infer<typeof removeSignupSchema>;
