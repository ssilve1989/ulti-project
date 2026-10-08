import { z } from 'zod';

export const boardSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  BOARD_BASE_URL: z.url(),
  BOARD_GUILD_ID: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  DISCORD_OAUTH_CLIENT_SECRET: z.string().min(1),
  BOARD_STATIC_DIR: z.string().optional(),
});

export const boardConfig = boardSchema.parse(process.env);
