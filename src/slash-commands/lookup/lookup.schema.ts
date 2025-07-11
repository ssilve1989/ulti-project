import { z } from 'zod';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { NorthAmericanWorlds } from '../../worlds/consts.js';

type LookupFields = Pick<SignupDocument, 'character'> & {
  world?: SignupDocument['world'];
};

export const lookupSchema = z.object({
  character: z
    .string()
    .min(1)
    .transform((str) => str.toLowerCase()),

  world: z
    .string()
    .optional()
    .transform((str) => str?.toLowerCase())
    .pipe(
      z
        .string()
        .refine(
          (val) => !val || NorthAmericanWorlds.has(val),
          'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
        ),
    ),
}) satisfies z.Schema<LookupFields>;

export type LookupSchema = z.infer<typeof lookupSchema>;
