import { Test } from '@nestjs/testing';
import { test as base, describe, expect } from 'vitest';
import { boardConfig } from '../../config/board.js';
import { DISCORD_CLIENT } from '../../discord/discord.decorators.js';
import { DiscordService } from '../../discord/discord.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { FIRESTORE } from '../../firebase/firebase.consts.js';
import { DiscordMock } from '../../test-utils/discord/discord-mock.js';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { BoardAccessService } from './board-access.service.js';

const GUILD = boardConfig.BOARD_GUILD_ID;
const VIEWER_ROLE = 'role-viewer';
const FROGS_ROLE = 'role-frogs';
const OWLS_ROLE = 'role-owls';
const MEMBER = Object.freeze({ id: 'member-1', username: 'member' });
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
const NOW = Date.parse('2026-10-08T12:00:00Z');

const it = base.extend<{
  discord: DiscordMock;
  db: InMemoryFirestore;
  access: BoardAccessService;
}>({
  discord: fresh(() => {
    const discord = new DiscordMock();
    discord.addRole(GUILD, { id: VIEWER_ROLE, name: 'Viewer' });
    discord.addRole(GUILD, { id: FROGS_ROLE, name: 'Frogs' });
    discord.addRole(GUILD, { id: OWLS_ROLE, name: 'Owls' });
    return discord;
  }),
  db: fresh(() => {
    const db = new InMemoryFirestore();
    db.seed(`settings/${GUILD}`, {
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
    return db;
  }),
  access: async ({ discord, db }, use) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BoardAccessService,
        DiscordService,
        SettingsCollection,
        { provide: FIRESTORE, useValue: db },
        { provide: DISCORD_CLIENT, useValue: discord.client },
      ],
    }).compile();
    await use(moduleRef.get(BoardAccessService));
  },
});

describe('BoardAccessService.resolve', () => {
  it('denies someone who is not in the board guild', async ({
    discord,
    access,
  }) => {
    discord.addUser(MEMBER);

    await expect(access.resolve(MEMBER.id, NOW)).resolves.toEqual({
      kind: 'denied',
      reason: 'not-in-guild',
    });
  });

  it('gives a member with a squad role and a viewer role their squad', async ({
    discord,
    access,
  }) => {
    discord.addMember({ ...MEMBER, roles: [VIEWER_ROLE, FROGS_ROLE] });

    await expect(access.resolve(MEMBER.id, NOW)).resolves.toEqual({
      kind: 'squad',
      squad: FROGS,
    });
  });

  it('marks a member with two squad roles as a squad conflict', async ({
    discord,
    access,
  }) => {
    discord.addMember({ ...MEMBER, roles: [OWLS_ROLE, FROGS_ROLE] });

    await expect(access.resolve(MEMBER.id, NOW)).resolves.toEqual({
      kind: 'squad-conflict',
      squads: [FROGS, OWLS],
    });
  });

  it('lets a member with only a viewer role view', async ({
    discord,
    access,
  }) => {
    discord.addMember({ ...MEMBER, roles: [VIEWER_ROLE] });

    await expect(access.resolve(MEMBER.id, NOW)).resolves.toEqual({
      kind: 'viewer',
    });
  });

  it('denies a member with no board role', async ({ discord, access }) => {
    discord.addMember(MEMBER);

    await expect(access.resolve(MEMBER.id, NOW)).resolves.toEqual({
      kind: 'denied',
      reason: 'no-role',
    });
  });

  describe('when the member loses their role after access was resolved', () => {
    it.beforeEach(async ({ discord, access }) => {
      discord.addMember({ ...MEMBER, roles: [FROGS_ROLE] });
      await access.resolve(MEMBER.id, NOW);
      discord.addMember(MEMBER);
    });

    it('keeps the cached access for 59s', async ({ access }) => {
      await expect(access.resolve(MEMBER.id, NOW + 59_000)).resolves.toEqual({
        kind: 'squad',
        squad: FROGS,
      });
    });

    it('resolves it again from their roles after 60s', async ({ access }) => {
      await expect(access.resolve(MEMBER.id, NOW + 60_000)).resolves.toEqual({
        kind: 'denied',
        reason: 'no-role',
      });
    });
  });
});
