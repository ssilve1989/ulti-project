import type { SignupDocument } from '@ulti-project/shared';
import { Encounter } from '@ulti-project/shared';
import { z } from 'zod';
import { NorthAmericanWorlds } from '../../worlds/consts.js';
import {
  PROG_PROOF_HOSTS_WHITELIST,
  WHITELIST_VALIDATION_ERROR,
} from './signup.consts.js';

type SignupFields = Omit<
  SignupDocument,
  'status' | 'partyStatus' | 'expiresAt' | 'availability'
>;

// the exact host or any subdomain of it
const PROG_PROOF_HOSTNAME = new RegExp(
  `^(?:.+\\.)?(?:${PROG_PROOF_HOSTS_WHITELIST.map((host) => host.replaceAll('.', '\\.')).join('|')})$`,
);

export const signupSchema = z
  .object({
    character: z
      .string()
      .min(1)
      .transform((str) => str.toLowerCase()),

    discordId: z.string().min(1),

    role: z.string().min(1),

    progPointRequested: z.string().min(1),

    encounter: z.enum(Encounter),

    notes: z.string().nullish(),

    proofOfProgLink: z
      .preprocess(
        (val) => {
          if (typeof val !== 'string') return val;
          return /^https?:\/\//i.test(val) ? val : `https://${val}`;
        },
        z.url({
          hostname: PROG_PROOF_HOSTNAME,
          normalize: true,
          error: (issue) =>
            issue.note === 'Invalid hostname'
              ? WHITELIST_VALIDATION_ERROR
              : undefined,
        }),
      )
      .nullable(),

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
  .check((ctx) => {
    const rawProofLink = ctx.value.proofOfProgLink;
    const rawScreenshot = ctx.value.screenshot;

    // Only require screenshot if no link was provided at all
    if (
      (rawProofLink === null || rawProofLink === undefined) &&
      !rawScreenshot
    ) {
      ctx.issues.push({
        code: 'custom',
        message: 'A screenshot must be attached if no link is provided',
        input: ctx.value.screenshot,
        path: ['screenshot'],
      });
    }
  }) satisfies z.Schema<SignupFields>;

export type SignupSchema = z.infer<typeof signupSchema>;
