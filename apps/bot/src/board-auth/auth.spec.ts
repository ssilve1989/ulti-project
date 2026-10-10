import { describe, expect, it } from 'vitest';
import { boardConfig } from '../config/board.js';
import { createBoardAuth, getBoardSession, isBoardUser } from './auth.js';

describe('isBoardUser', () => {
  it('rejects a session user without a Discord ID', () => {
    expect(isBoardUser({ name: 'Alice', image: null })).toBe(false);
  });

  it('rejects a session user with an empty Discord ID', () => {
    expect(isBoardUser({ name: 'Alice', image: null, discordId: '' })).toBe(
      false,
    );
  });

  it('accepts a session user with a Discord ID', () => {
    expect(
      isBoardUser({
        name: 'Alice',
        image: null,
        discordId: '111111111111111111',
      }),
    ).toBe(true);
  });
});

describe('getBoardSession', () => {
  it('finds no session on a request without a session cookie', async () => {
    const auth = createBoardAuth(boardConfig);

    await expect(getBoardSession(auth, { headers: {} })).resolves.toBe(
      undefined,
    );
  });
});
