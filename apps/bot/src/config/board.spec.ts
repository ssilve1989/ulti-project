import { describe, expect, it } from 'vitest';
import { boardSchema } from './board.js';

const REQUIRED = Object.freeze({
  BOARD_BASE_URL: 'https://board.example.test',
  BOARD_GUILD_ID: 'guild-id',
  BETTER_AUTH_SECRET: 'a-test-secret-of-at-least-32-chars',
  DISCORD_OAUTH_CLIENT_SECRET: 'oauth-secret',
});

/** The settings a parse refused, by name. */
function refusedFields(env: Record<string, string>): PropertyKey[][] {
  return boardSchema.safeParse(env).error?.issues.map(({ path }) => path) ?? [];
}

describe('boardSchema', () => {
  it('serves on port 3000 with no static directory by default', () => {
    expect(boardSchema.parse(REQUIRED)).toEqual({ ...REQUIRED, PORT: 3000 });
  });

  it('refuses a secret shorter than 32 characters', () => {
    expect(
      refusedFields({ ...REQUIRED, BETTER_AUTH_SECRET: 'x'.repeat(31) }),
    ).toEqual([['BETTER_AUTH_SECRET']]);
  });

  it('refuses a base URL that is not a URL', () => {
    expect(
      refusedFields({ ...REQUIRED, BOARD_BASE_URL: 'board.example.test' }),
    ).toEqual([['BOARD_BASE_URL']]);
  });
});
