import { test as base, describe, expect, vi } from 'vitest';
import { boardConfig } from '../../config/board.js';
import {
  type DiscordAccount,
  signInAs,
} from '../../test-utils/discord-oauth.js';
import { fresh } from '../../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../../test-utils/flow-app.js';

const GUILD = boardConfig.GUILD_ID;
const VIEWER_ROLE = 'role-viewer';
const FROGS_ROLE = 'role-frogs';
const OWLS_ROLE = 'role-owls';
const NOW = new Date('2026-10-08T12:00:00Z');

/** Leads the Frogs. */
const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
});
/** Frogs, named in the guild by a nickname. */
const HANK = Object.freeze({
  id: '888888888888888888',
  username: 'hank',
  displayName: 'Hank the Healer',
});
/** Frogs. */
const BEA = Object.freeze({
  id: '222222222222222222',
  username: 'bea',
  displayName: 'bea',
});
/** Owls, so never a Frogs helper. */
const DAVE = Object.freeze({
  id: '444444444444444444',
  username: 'dave',
  displayName: 'Dave',
});
/** In the server, in no squad. */
const GUS = Object.freeze({
  id: '999999999999999999',
  username: 'gus',
  displayName: 'Gus',
});
/** Joins the Frogs during a test. */
const IVY = Object.freeze({
  id: '333333333333333333',
  username: 'ivy',
  displayName: 'Ivy',
});

/** Boots the board at NOW, with a viewer role, two squads and their members. */
async function startFlow(): Promise<HttpFlowApp> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const flow = await createFlowApp({ http: true });
    flow.discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
    flow.discord.addRole(GUILD, { id: FROGS_ROLE, name: 'Frogs' });
    flow.discord.addRole(GUILD, { id: OWLS_ROLE, name: 'Owls' });
    flow.db.seed(`settings/${GUILD}`, {
      boardViewerRoles: [VIEWER_ROLE],
      squads: {
        frg: {
          name: 'Frogs',
          tag: 'FRG',
          color: '#16a34a',
          roleId: FROGS_ROLE,
        },
        owl: { name: 'Owls', tag: 'OWL', color: '#7c3aed', roleId: OWLS_ROLE },
      },
    });
    flow.discord.addMember({ ...HANK, roles: [FROGS_ROLE] });
    flow.discord.addMember({ ...DAVE, roles: [OWLS_ROLE] });
    flow.discord.addMember({ ...BEA, roles: [FROGS_ROLE, VIEWER_ROLE] });
    flow.discord.addMember({ ...GUS, roles: [] });
    return flow;
  } catch (error) {
    vi.useRealTimers();
    throw error;
  }
}

async function stopFlow(flow: HttpFlowApp): Promise<void> {
  try {
    await flow.close();
  } finally {
    vi.useRealTimers();
  }
}

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(startFlow, stopFlow),
});

/** Alice signs in to the board holding `roles`. */
async function aliceSignsIn(flow: HttpFlowApp, roles: string[]) {
  flow.discord.addMember({
    id: ALICE.id,
    username: ALICE.username,
    globalName: ALICE.globalName,
    roles,
  });
  await signInAs(flow, ALICE);
}

async function getHelpers(flow: HttpFlowApp) {
  const { status, body } = await flow.http.get('/api/squads/mine/helpers');
  return { status, body };
}

describe('when a squad lead asks for their helpers', () => {
  it.beforeEach(async ({ flow }) => {
    await aliceSignsIn(flow, [FROGS_ROLE]);
  });

  it("lists every member of the squad's role, by guild name", async ({
    flow,
  }) => {
    await expect(getHelpers(flow)).resolves.toEqual({
      status: 200,
      body: [
        { discordId: ALICE.id, displayName: ALICE.globalName },
        { discordId: BEA.id, displayName: BEA.displayName },
        { discordId: HANK.id, displayName: HANK.displayName },
      ],
    });
  });

  describe('and someone joins the squad', () => {
    it.beforeEach(async ({ flow }) => {
      await getHelpers(flow);
      flow.discord.addMember({ ...IVY, roles: [FROGS_ROLE] });
    });

    it('leaves them out for a minute', async ({ flow }) => {
      vi.setSystemTime(NOW.getTime() + 59_000);

      await expect(getHelpers(flow)).resolves.toEqual({
        status: 200,
        body: [
          { discordId: ALICE.id, displayName: ALICE.globalName },
          { discordId: BEA.id, displayName: BEA.displayName },
          { discordId: HANK.id, displayName: HANK.displayName },
        ],
      });
    });

    it('lists them 61s later', async ({ flow }) => {
      vi.setSystemTime(NOW.getTime() + 61_000);

      await expect(getHelpers(flow)).resolves.toEqual({
        status: 200,
        body: [
          { discordId: ALICE.id, displayName: ALICE.globalName },
          { discordId: BEA.id, displayName: BEA.displayName },
          { discordId: HANK.id, displayName: HANK.displayName },
          { discordId: IVY.id, displayName: IVY.displayName },
        ],
      });
    });
  });
});

describe('when a viewer asks for helpers', () => {
  it.beforeEach(async ({ flow }) => {
    await aliceSignsIn(flow, [VIEWER_ROLE]);
  });

  it('answers 403 no-squad', async ({ flow }) => {
    await expect(getHelpers(flow)).resolves.toEqual({
      status: 403,
      body: { reason: 'no-squad' },
    });
  });
});
