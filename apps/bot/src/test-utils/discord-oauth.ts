import nock from 'nock';
import type { Agent } from 'supertest';
import { appConfig } from '../config/app.js';
import { boardConfig } from '../config/board.js';
import type { HttpFlowApp } from './flow-app.js';

/** A Discord account signing in to the board. */
export interface DiscordAccount {
  readonly id: string;
  readonly username: string;
  readonly globalName?: string;
  /** The avatar hash, if they've set one. */
  readonly avatar?: string;
}

/** The authorization code Discord hands the board's callback in these tests. */
const CODE = 'test';

/** The address Discord's sign-in emails go to, for an account. */
export function discordEmail(account: DiscordAccount): string {
  return `${account.username}@users.example.test`;
}

/** What Discord's `GET /users/@me` returns for the account. */
function discordProfile(account: DiscordAccount) {
  return {
    id: account.id,
    username: account.username,
    global_name: account.globalName ?? null,
    avatar: account.avatar ?? null,
    discriminator: '0',
    email: discordEmail(account),
    verified: true,
  };
}

/**
 * Signs `account` in through the board's real Discord sign-in, as a browser
 * would: start sign-in, then come back to the callback with Discord's code.
 * Discord's token and user endpoints are intercepted with nock, which the flow
 * app keeps active (blocking any real network) from its start until it closes;
 * closing removes these interceptors with the rest. The agent (`flow.http`
 * unless given; pass `flow.agent()` for a second user) then holds the session
 * cookie.
 */
export async function signInAs(
  flow: HttpFlowApp,
  account: DiscordAccount,
  agent: Agent = flow.http,
): Promise<void> {
  const accessToken = `access-token-for-${account.id}`;
  const discord = nock('https://discord.com')
    .post('/api/oauth2/token', {
      grant_type: 'authorization_code',
      code: CODE,
      redirect_uri: `${flow.boardUrl}/api/auth/callback/discord`,
      client_id: appConfig.CLIENT_ID,
      client_secret: boardConfig.DISCORD_OAUTH_CLIENT_SECRET,
    })
    .reply(200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 604_800,
      refresh_token: `refresh-token-for-${account.id}`,
      scope: 'identify email',
    })
    // better-auth calls https://discord.com/api/users/@me, which fetch sends encoded
    .get('/api/users/%40me')
    .matchHeader('authorization', `Bearer ${accessToken}`)
    .reply(200, discordProfile(account));

  const started = await agent
    .post('/api/auth/sign-in/social')
    .set('Origin', flow.boardUrl)
    .send({ provider: 'discord', callbackURL: '/' });
  const authorizeUrl: unknown = started.body?.url;
  if (started.status !== 200 || typeof authorizeUrl !== 'string') {
    throw new Error(
      `Starting sign-in failed: ${started.status} ${JSON.stringify(started.body)}`,
    );
  }
  const state = new URL(authorizeUrl).searchParams.get('state');
  if (state === null) {
    throw new Error(`Discord's authorize URL has no state: ${authorizeUrl}`);
  }

  const callback = await agent
    .get('/api/auth/callback/discord')
    .query({ code: CODE, state });
  if (callback.status !== 302 || callback.headers.location !== '/') {
    throw new Error(
      `Discord's callback failed: ${callback.status} to ${callback.headers.location}`,
    );
  }
  if (!discord.isDone()) {
    throw new Error(`Sign-in skipped Discord: ${discord.pendingMocks()}`);
  }
}
