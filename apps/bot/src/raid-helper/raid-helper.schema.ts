import { z } from 'zod';

const raidHelperEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  signUps: z.array(
    z.object({
      /** the member's Discord id */
      userId: z.string(),
      name: z.string(),
      className: z.string(),
      // raid-helper leaves it out for sign-ups without a spec, e.g. Allrounder
      specName: z.string().nullish(),
      /** the order members signed up in, from 1 */
      position: z.number(),
    }),
  ),
});

const raidHelperFailureSchema = z.object({
  status: z.literal('failed'),
  reason: z.string(),
});

type RaidHelperEvent = z.infer<typeof raidHelperEventSchema>;

export { type RaidHelperEvent, raidHelperEventSchema, raidHelperFailureSchema };
