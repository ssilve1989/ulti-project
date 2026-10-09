import { test as base, describe, expect } from 'vitest';
import {
  type DiscordAccount,
  discordEmail,
  signInAs,
  signInWithDiscord,
} from '../test-utils/discord-oauth.js';
import { fresh } from '../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../test-utils/flow-app.js';
import { isoDateSince } from '../test-utils/matchers.js';

const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
  avatar: 'a1b2c3d4',
});
const BOB: DiscordAccount = Object.freeze({
  id: '222222222222222222',
  username: 'bob',
});

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(
    () => createFlowApp({ http: true }),
    (flow) => flow.close(),
  ),
});

/** The user better-auth's get-session returns for Alice, signed in during this test. */
function aliceUser(flow: HttpFlowApp) {
  return {
    id: expect.stringMatching(/^[A-Za-z0-9]{32}$/),
    name: 'Alice',
    email: discordEmail(ALICE),
    emailVerified: true,
    image: `https://cdn.discordapp.com/avatars/${ALICE.id}/${ALICE.avatar}.png`,
    discordId: ALICE.id,
    createdAt: isoDateSince(flow.startedAt),
    updatedAt: isoDateSince(flow.startedAt),
  };
}

describe('when a coordinator comes back from Discord', () => {
  it('sets their session cookie and no cookie with their Discord tokens', async ({
    flow,
  }) => {
    await expect(signInWithDiscord(flow, ALICE)).resolves.toEqual({
      status: 302,
      location: '/',
      // the state cookie is cleared; no `better-auth.account_data`
      cookies: [
        'better-auth.oauth_state',
        'better-auth.session_token',
        'better-auth.session_data',
      ],
    });
  });
});

describe('when a coordinator signs in with Discord', () => {
  it.beforeEach(({ flow }) => signInAs(flow, ALICE));

  it('gives them a session carrying their Discord ID', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/auth/get-session');

    expect({ status, user: body.user }).toEqual({
      status: 200,
      user: aliceUser(flow),
    });
  });

  describe('and they try to change their Discord ID', () => {
    it('answers 404 and keeps their own Discord ID', async ({ flow }) => {
      const update = await flow.http
        .post('/api/auth/update-user')
        .set('Origin', flow.boardUrl)
        .send({ discordId: BOB.id });
      const session = await flow.http.get('/api/auth/get-session');

      expect({
        update: { status: update.status, body: update.body },
        user: session.body.user,
      }).toEqual({
        update: { status: 404, body: { reason: 'not-found' } },
        user: aliceUser(flow),
      });
    });
  });

  describe('and another Discord account signs in with the same email', () => {
    it('does not sign them in as the first coordinator', async ({ flow }) => {
      const bob = flow.agent();

      const callback = await signInWithDiscord(
        flow,
        { ...BOB, email: discordEmail(ALICE) },
        bob,
      );
      const session = await bob.get('/api/auth/get-session');

      expect({
        callback,
        session: { status: session.status, body: session.body },
      }).toEqual({
        callback: {
          status: 302,
          location: `${flow.boardUrl}/api/auth/error?error=account_not_linked`,
          cookies: ['better-auth.oauth_state'],
        },
        session: { status: 200, body: null },
      });
    });
  });

  describe('and they sign out', () => {
    it('ends their session', async ({ flow }) => {
      const signOut = await flow.http
        .post('/api/auth/sign-out')
        .set('Origin', flow.boardUrl);
      const session = await flow.http.get('/api/auth/get-session');

      expect({
        signOut: { status: signOut.status, body: signOut.body },
        session: { status: session.status, body: session.body },
      }).toEqual({
        signOut: { status: 200, body: { success: true } },
        session: { status: 200, body: null },
      });
    });
  });
});

describe('when someone calls an auth route the board does not use', () => {
  it('answers 404 to signing up with an email', async ({ flow }) => {
    const { status, body } = await flow.http
      .post('/api/auth/sign-up/email')
      .set('Origin', flow.boardUrl)
      .send({ email: 'mallory@example.test', password: 'hunter2hunter2' });

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });

  it('answers 404 to updating the user with a trailing slash', async ({
    flow,
  }) => {
    const { status, body } = await flow.http
      .post('/api/auth/update-user/')
      .set('Origin', flow.boardUrl)
      .send({ discordId: BOB.id });

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });

  it('answers 404 to updating the user in upper case', async ({ flow }) => {
    const { status, body } = await flow.http
      .post('/api/AUTH/UPDATE-USER')
      .set('Origin', flow.boardUrl)
      .send({ discordId: BOB.id });

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });

  it('answers 404 to listing sessions', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/auth/list-sessions');

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });

  it('answers 404 to starting sign-in with GET', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/auth/sign-in/social');

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });
});
