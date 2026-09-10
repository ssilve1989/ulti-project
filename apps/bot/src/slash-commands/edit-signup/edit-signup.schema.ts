import { Encounter } from '@ulti-project/shared';
import { z } from 'zod';

export const editSignupSchema = z
  .object({
    user: z.string().min(1).optional(),

    character: z
      .string()
      .min(1)
      .max(64)
      .transform((str) => str.toLowerCase())
      .optional(),

    encounter: z.enum(Encounter).optional(),
  })
  .check((ctx) => {
    const hasUser = ctx.value.user !== undefined;
    const hasCharacter = ctx.value.character !== undefined;

    // exactly one of `user` / `character` must be present
    if (hasUser === hasCharacter) {
      ctx.issues.push({
        code: 'custom',
        message:
          'Provide either a user or a character name, not both / neither',
        input: ctx.value,
        path: ['user'],
      });
    }
  });

export type EditSignupSchema = z.infer<typeof editSignupSchema>;
