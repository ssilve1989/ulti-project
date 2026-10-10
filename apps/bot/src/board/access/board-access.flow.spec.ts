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

const ALICE: DiscordAccount = Object.freeze({
  id: '111111111111111111',
  username: 'alice',
  globalName: 'Alice',
  avatar: 'a1b2c3d4',
});
/** Alice's nickname in the board guild. */
const ALICE_NICKNAME = 'Alice (Frogs lead)';
const ALICE_AVATAR_URL = `https://cdn.discordapp.com/avatars/${ALICE.id}/${ALICE.avatar}.png`;

const FROGS = Object.freeze({
  id: 'frg',
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
});
const OWLS = Object.freeze({
  id: 'owl',
  name: 'Owls',
  tag: 'OWL',
  color: '#7c3aed',
});

/** Boots the board at NOW, with a viewer role and two squads configured for its guild. */
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

/** Alice joins the board guild holding `roles`; joining again replaces her roles. */
function aliceJoins(flow: HttpFlowApp, roles: string[]): void {
  flow.discord.addMember({
    id: ALICE.id,
    username: ALICE.username,
    globalName: ALICE.globalName,
    displayName: ALICE_NICKNAME,
    roles,
  });
}

async function getMe(flow: HttpFlowApp) {
  const { status, body } = await flow.http.get('/api/me');
  return { status, body };
}

describe('when someone who is not signed in asks who they are', () => {
  it('answers 401 signed-out', async ({ flow }) => {
    await expect(getMe(flow)).resolves.toEqual({
      status: 401,
      body: { reason: 'signed-out' },
    });
  });
});

describe('when someone outside the board guild signs in', () => {
  it.beforeEach(async ({ flow }) => {
    flow.discord.addUser({
      id: ALICE.id,
      username: ALICE.username,
      globalName: ALICE.globalName,
    });
    await signInAs(flow, ALICE);
  });

  it('answers 403 not-in-guild', async ({ flow }) => {
    await expect(getMe(flow)).resolves.toEqual({
      status: 403,
      body: { reason: 'not-in-guild' },
    });
  });
});

describe('when a member with no board role signs in', () => {
  it.beforeEach(async ({ flow }) => {
    aliceJoins(flow, []);
    await signInAs(flow, ALICE);
  });

  it('answers 403 no-role', async ({ flow }) => {
    await expect(getMe(flow)).resolves.toEqual({
      status: 403,
      body: { reason: 'no-role' },
    });
  });
});

describe('when a member with a viewer role signs in', () => {
  it.beforeEach(async ({ flow }) => {
    aliceJoins(flow, [VIEWER_ROLE]);
    await signInAs(flow, ALICE);
  });

  it('tells them they can view the board, by their guild name', async ({
    flow,
  }) => {
    await expect(getMe(flow)).resolves.toEqual({
      status: 200,
      body: {
        discordId: ALICE.id,
        displayName: ALICE_NICKNAME,
        avatarUrl: ALICE_AVATAR_URL,
        access: { kind: 'viewer' },
      },
    });
  });

  describe('and they leave the guild within a minute', () => {
    it('names them by their Discord name until their access expires', async ({
      flow,
    }) => {
      await getMe(flow);
      flow.discord.removeMember(ALICE.id);

      await expect(getMe(flow)).resolves.toEqual({
        status: 200,
        body: {
          discordId: ALICE.id,
          displayName: ALICE.globalName,
          avatarUrl: ALICE_AVATAR_URL,
          access: { kind: 'viewer' },
        },
      });
    });
  });

  describe('and they leave the guild', () => {
    it('answers 403 not-in-guild once their access expires, 61s later', async ({
      flow,
    }) => {
      await getMe(flow);
      flow.discord.removeMember(ALICE.id);
      vi.setSystemTime(NOW.getTime() + 61_000);

      await expect(getMe(flow)).resolves.toEqual({
        status: 403,
        body: { reason: 'not-in-guild' },
      });
    });
  });
});

describe('when a member of a squad signs in', () => {
  it.beforeEach(async ({ flow }) => {
    aliceJoins(flow, [FROGS_ROLE]);
    await signInAs(flow, ALICE);
  });

  it('tells them their squad', async ({ flow }) => {
    await expect(getMe(flow)).resolves.toEqual({
      status: 200,
      body: {
        discordId: ALICE.id,
        displayName: ALICE_NICKNAME,
        avatarUrl: ALICE_AVATAR_URL,
        access: { kind: 'squad', squad: FROGS },
      },
    });
  });

  describe('and loses their squad role', () => {
    it('answers 403 no-role 61s later', async ({ flow }) => {
      await getMe(flow);
      aliceJoins(flow, []);
      vi.setSystemTime(NOW.getTime() + 61_000);

      await expect(getMe(flow)).resolves.toEqual({
        status: 403,
        body: { reason: 'no-role' },
      });
    });
  });
});

describe('when a member of two squads signs in', () => {
  it.beforeEach(async ({ flow }) => {
    aliceJoins(flow, [OWLS_ROLE, FROGS_ROLE]);
    await signInAs(flow, ALICE);
  });

  it('tells them their squads conflict', async ({ flow }) => {
    await expect(getMe(flow)).resolves.toEqual({
      status: 200,
      body: {
        discordId: ALICE.id,
        displayName: ALICE_NICKNAME,
        avatarUrl: ALICE_AVATAR_URL,
        access: { kind: 'squad-conflict', squads: [FROGS, OWLS] },
      },
    });
  });
});
