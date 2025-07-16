import { z } from 'zod';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { NorthAmericanWorlds } from '../../../../worlds/consts.js';

export const removeSignupSchema = z.object({
  character: z
    .string()
    .min(1)
    .transform((str) => str.toLowerCase()),

  encounter: z.enum(Encounter),

  world: z
    .string()
    .transform((str) => str.toLowerCase())
    .refine(
      (val) => NorthAmericanWorlds.has(val),
      'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
    ),
});

export type RemoveSignupSchema = z.infer<typeof removeSignupSchema>;
