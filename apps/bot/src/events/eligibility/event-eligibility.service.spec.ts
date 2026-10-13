import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type ProgPointDocument,
} from '@ulti-project/shared';
import { Collection, type GuildMember, type Role } from 'discord.js';
import { test as base, describe, expect } from 'vitest';
import { EncountersCollection } from '../../firebase/collections/encounters-collection.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { FIRESTORE } from '../../firebase/firebase.consts.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { InMemoryFirestore } from '../../test-utils/firestore/in-memory-firestore.js';
import { fresh } from '../../test-utils/fixtures.js';
import { mockOf } from '../../test-utils/mock-factory.js';
import { EventEligibilityService } from './event-eligibility.service.js';

const GUILD = 'guild-1';

const PROG_POINTS = Object.freeze<ProgPointDocument[]>([
  {
    id: 'P1',
    label: 'Phase 1',
    partyStatus: PartyStatus.EarlyProgParty,
    order: 0,
    active: true,
  },
  {
    id: 'P2',
    label: 'Phase 2',
    partyStatus: PartyStatus.ProgParty,
    order: 1,
    active: true,
  },
  {
    id: 'P3',
    label: 'Phase 3',
    partyStatus: PartyStatus.ProgParty,
    order: 2,
    active: true,
  },
  {
    id: 'P4',
    label: 'Phase 4',
    partyStatus: PartyStatus.ClearParty,
    order: 3,
    active: true,
  },
]);

const SETTINGS = Object.freeze<SettingsDocument>({
  progPointRoles: {
    DSR: {
      P1: 'role-early',
      P2: 'role-early',
      P3: 'role-p3',
      P4: 'role-p4',
    },
    TOP: { P1: 'role-top' },
  },
  clearRoles: { DSR: 'role-cleared', TOP: 'role-top-cleared' },
});

const ROLE_NAMES = Object.freeze<Record<string, string>>({
  'role-early': 'DSR Early Prog',
  'role-p3': 'DSR P3',
  'role-p4': 'DSR P4',
  'role-cleared': 'DSR Cleared',
  'role-top': 'TOP P1',
  'role-top-cleared': 'TOP Cleared',
  'role-other': 'Raider',
});

function memberWith(...roleIds: string[]) {
  const cache = new Collection<string, Role>(
    roleIds.map((id) => [id, mockOf<Role>({ id, name: ROLE_NAMES[id] })]),
  );
  return mockOf<GuildMember>({ guild: { id: GUILD }, roles: { cache } });
}

const it = base.extend<{ eligibility: EventEligibilityService }>({
  eligibility: fresh(async () => {
    const db = new InMemoryFirestore();
    db.seed(`settings/${GUILD}`, SETTINGS);
    for (const point of PROG_POINTS) {
      db.seed(`encounters/${Encounter.DSR}/prog-points/${point.id}`, point);
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventEligibilityService,
        SettingsCollection,
        EncountersCollection,
        { provide: FIRESTORE, useValue: db },
      ],
    }).compile();
    return moduleRef.get(EventEligibilityService);
  }),
});

describe('EventEligibilityService', () => {
  describe('when the member holds one mapped prog-point role', () => {
    it('gives the phase of that role', async ({ eligibility }) => {
      await expect(
        eligibility.resolve(memberWith('role-p3', 'role-other'), Encounter.DSR),
      ).resolves.toEqual({
        eligible: true,
        phase: { roleId: 'role-p3', label: 'DSR P3', order: 2, bucket: 'prog' },
      });
    });
  });

  describe('when the member holds a role mapped to two prog points', () => {
    it('takes the higher order of the two', async ({ eligibility }) => {
      await expect(
        eligibility.resolve(memberWith('role-early'), Encounter.DSR),
      ).resolves.toEqual({
        eligible: true,
        phase: {
          roleId: 'role-early',
          label: 'DSR Early Prog',
          order: 1,
          bucket: 'prog',
        },
      });
    });
  });

  describe('when the member holds two mapped roles', () => {
    it('takes the furthest', async ({ eligibility }) => {
      await expect(
        eligibility.resolve(memberWith('role-p3', 'role-early'), Encounter.DSR),
      ).resolves.toEqual({
        eligible: true,
        phase: { roleId: 'role-p3', label: 'DSR P3', order: 2, bucket: 'prog' },
      });
    });
  });

  describe('when the member holds the clear role', () => {
    it('ranks it ahead of every prog role, in the clear bucket', async ({
      eligibility,
    }) => {
      await expect(
        eligibility.resolve(
          memberWith('role-p4', 'role-cleared', 'role-early'),
          Encounter.DSR,
        ),
      ).resolves.toEqual({
        eligible: true,
        phase: {
          roleId: 'role-cleared',
          label: 'DSR Cleared',
          order: 4,
          bucket: 'clear',
        },
      });
    });
  });

  describe('when the member holds a role for a Clear Party prog point', () => {
    it('puts them in the clear bucket', async ({ eligibility }) => {
      await expect(
        eligibility.resolve(memberWith('role-p4'), Encounter.DSR),
      ).resolves.toEqual({
        eligible: true,
        phase: {
          roleId: 'role-p4',
          label: 'DSR P4',
          order: 3,
          bucket: 'clear',
        },
      });
    });
  });

  describe('when the member holds no roles', () => {
    it('is not eligible', async ({ eligibility }) => {
      await expect(
        eligibility.resolve(memberWith(), Encounter.DSR),
      ).resolves.toEqual({ eligible: false });
    });
  });

  describe('when the member only holds roles for another encounter', () => {
    it('is not eligible', async ({ eligibility }) => {
      await expect(
        eligibility.resolve(
          memberWith('role-top', 'role-top-cleared', 'role-other'),
          Encounter.DSR,
        ),
      ).resolves.toEqual({ eligible: false });
    });
  });
});
