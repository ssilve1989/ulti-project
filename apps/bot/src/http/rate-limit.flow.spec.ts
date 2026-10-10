import { test as base, describe, expect } from 'vitest';
import { boardConfig } from '../config/board.js';
import { type DiscordAccount, signInAs } from '../test-utils/discord-oauth.js';
import { fresh } from '../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../test-utils/flow-app.js';

const GUILD = boardConfig.GUILD_ID;
const VIEWER_ROLE = 'role-viewer';
const LIMIT = 120;

const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
});

/** The app, with Alice signed in as a viewer. */
async function startFlow(): Promise<HttpFlowApp> {
  const flow = await createFlowApp({ http: true });
  flow.discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
  flow.discord.addMember({
    id: ALICE.id,
    username: ALICE.username,
    globalName: ALICE.globalName,
    roles: [VIEWER_ROLE],
  });
  flow.db.seed(`settings/${GUILD}`, { boardViewerRoles: [VIEWER_ROLE] });
  await signInAs(flow, ALICE);
  return flow;
}

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(startFlow, (flow) => flow.close()),
});

/** The statuses of `count` requests for `path`, sent one after another from `clientIp`. */
async function statuses(
  flow: HttpFlowApp,
  path: string,
  clientIp: string,
  count: number,
): Promise<number[]> {
  const answered: number[] = [];
  for (let i = 0; i < count; i++) {
    const { status } = await flow.http.get(path).set('Fly-Client-IP', clientIp);
    answered.push(status);
  }
  return answered;
}

describe('when one client sends more board API requests in a minute than the limit', () => {
  it('answers the request over the limit 429 rate-limited, and still answers another client', async ({
    flow,
  }) => {
    const underLimit = await statuses(
      flow,
      '/api/events',
      '203.0.113.7',
      LIMIT,
    );
    const over = await flow.http
      .get('/api/events')
      .set('Fly-Client-IP', '203.0.113.7');
    const otherClient = await flow.http
      .get('/api/events')
      .set('Fly-Client-IP', '198.51.100.4');

    expect({
      underLimit,
      over: {
        status: over.status,
        retryAfter: over.headers['retry-after'],
        body: over.body,
      },
      otherClient: otherClient.status,
    }).toEqual({
      underLimit: Array(LIMIT).fill(200),
      over: { status: 429, retryAfter: '60', body: { reason: 'rate-limited' } },
      otherClient: 200,
    });
  });
});

describe('when Fly checks the health of the bot more often than the limit', () => {
  it('answers every check', async ({ flow }) => {
    const checks = await statuses(
      flow,
      '/api/health',
      '203.0.113.7',
      LIMIT + 5,
    );

    expect(checks).toEqual(Array(LIMIT + 5).fill(200));
  });
});
