import { z } from 'zod/v4';
import { Encounter } from '../../encounters/encounters.consts.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { NorthAmericanWorlds } from '../../worlds/consts.js';
import {
  PROG_PROOF_HOSTS_WHITELIST,
  WHITELIST_VALIDATION_ERROR,
} from './signup.consts.js';

type SignupFields = Omit<
  SignupDocument,
  'status' | 'partyStatus' | 'expiresAt'
>;

export const signupSchema = z
  .object({
    availability: z.string().min(1),

    character: z
      .string()
      .min(1)
      .transform((str) => str.toLowerCase()),

    discordId: z.string().min(1),

    role: z.string().min(1),

    progPointRequested: z.string().min(1),

    encounter: z.nativeEnum(Encounter),

    notes: z.string().nullish(),

    proofOfProgLink: z
      .string()
      .nullish()
      .transform((val) => {
        if (!val) return null;
        if (!val.startsWith('http')) return `https://${val}`;
        return val;
      })
      .pipe(
        z
          .string()
          .url()
          .refine(
            (url) =>
              PROG_PROOF_HOSTS_WHITELIST.some((regex) => regex.test(url)),
            WHITELIST_VALIDATION_ERROR,
          )
          .nullable(),
      ),

    screenshot: z.string().nullish().default(null),

    username: z
      .string()
      .min(1)
      .transform((str) => str.toLowerCase()),

    world: z
      .string()
      .transform((str) => str.toLowerCase())
      .refine(
        (val) => NorthAmericanWorlds.has(val),
        'Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
      ),
  })
  .superRefine((data, ctx) => {
    const rawProofLink = data.proofOfProgLink;
    const rawScreenshot = data.screenshot;

    // Only require screenshot if no link was provided at all
    if (
      (rawProofLink === null || rawProofLink === undefined) &&
      !rawScreenshot
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A screenshot must be attached if no link is provided',
        path: ['screenshot'],
      });
    }
  }) satisfies z.Schema<SignupFields>;

export type SignupSchema = z.infer<typeof signupSchema>;
