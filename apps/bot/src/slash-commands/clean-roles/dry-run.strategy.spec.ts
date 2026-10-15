import { Logger } from '@nestjs/common';
import type { SignupDocument } from '@ulti-project/shared';
import { test as base, describe, expect } from 'vitest';
import { fresh } from '#src/test-utils/fixtures.js';
import { createAutoMock, partialMock } from '#src/test-utils/mock-factory.js';
import type {
  DryRunRoleResult,
  ProcessingContext,
} from './clean-roles.interfaces.js';
import {
  memberWith,
  processRoles,
  roleHeldBy,
} from './clean-roles.test-helpers.js';
import { planRoleRemovals } from './clean-roles.utils.js';
import { DryRunStrategy } from './dry-run.strategy.js';

const it = base.extend<{ strategy: DryRunStrategy }>({
  strategy: fresh(() => new DryRunStrategy(createAutoMock<Logger>())),
});

describe('DryRunStrategy', () => {
  describe('when members without an active signup hold a role', () => {
    it('lists them as losing it, and leaves members with an active signup off', async ({
      strategy,
    }) => {
      const active = memberWith('active');
      const lapsed = memberWith('lapsed');

      expect(
        await processRoles(
          strategy,
          [roleHeldBy('r1', [active, lapsed])],
          new Set([active.id]),
        ),
      ).toEqual([
        {
          roleId: 'r1',
          roleName: 'Role r1',
          membersProcessed: 2,
          rolesRemoved: 1,
          removable: true,
          membersToRemove: [
            { id: 'lapsed', displayName: 'Nick lapsed', username: 'lapsed' },
          ],
        },
      ]);
    });
  });

  describe('when a role has no members', () => {
    it('reports it with nothing to remove', async ({ strategy }) => {
      expect(
        await processRoles(strategy, [roleHeldBy('r1', [])], new Set()),
      ).toEqual([
        {
          roleId: 'r1',
          roleName: 'Role r1',
          membersProcessed: 0,
          rolesRemoved: 0,
          removable: true,
          membersToRemove: [],
        },
      ]);
    });
  });

  describe('when the bot may not remove a role', () => {
    it('counts the holders who would keep it instead of listing them', async ({
      strategy,
    }) => {
      expect(
        await processRoles(
          strategy,
          [roleHeldBy('r1', [memberWith('lapsed')], { editable: false })],
          new Set(),
        ),
      ).toEqual([
        {
          roleId: 'r1',
          roleName: 'Role r1',
          membersProcessed: 1,
          rolesRemoved: 0,
          removable: false,
          unremovable: 1,
        },
      ]);
    });
  });

  describe('createResult', () => {
    it('totals the roles, and counts members who keep a role', ({
      strategy,
    }) => {
      const processedRoles: DryRunRoleResult[] = [
        {
          roleId: 'role-1',
          roleName: 'Role One',
          membersProcessed: 3,
          rolesRemoved: 3,
          removable: true,
          membersToRemove: [
            { id: 'user-1', displayName: 'Nick user-1', username: 'user-1' },
            { id: 'user-2', displayName: 'Nick user-2', username: 'user-2' },
            { id: 'user-3', displayName: 'Nick user-3', username: 'user-3' },
          ],
        },
        {
          roleId: 'role-2',
          roleName: 'Role Two',
          membersProcessed: 2,
          rolesRemoved: 0,
          removable: false,
          unremovable: 1,
        },
      ];
      // user-4 has an active signup; user-5 keeps role-2, which the bot can't remove
      const context: ProcessingContext = {
        plans: planRoleRemovals(
          [
            roleHeldBy('role-1', [
              memberWith('user-1'),
              memberWith('user-2'),
              memberWith('user-3'),
            ]),
            roleHeldBy('role-2', [memberWith('user-4'), memberWith('user-5')], {
              editable: false,
            }),
          ],
          new Set(['user-4']),
        ),
        activeSignups: partialMock<SignupDocument[]>([{}, {}, {}]),
      };

      expect(strategy.createResult(context, processedRoles)).toEqual({
        isDryRun: true,
        totalRolesProcessed: 2,
        totalMembersProcessed: 5,
        totalRolesRemoved: 3,
        totalUnremovable: 1,
        totalActiveSignups: 3,
        uniqueMembersWithRoles: 5,
        uniqueMembersAfterRemoval: 2,
        processedRoles,
      });
    });

    it('reports zeroes when no roles were processed', ({ strategy }) => {
      expect(
        strategy.createResult({ plans: [], activeSignups: [] }, []),
      ).toEqual({
        isDryRun: true,
        totalRolesProcessed: 0,
        totalMembersProcessed: 0,
        totalRolesRemoved: 0,
        totalUnremovable: 0,
        totalActiveSignups: 0,
        uniqueMembersWithRoles: 0,
        uniqueMembersAfterRemoval: 0,
        processedRoles: [],
      });
    });
  });
});
