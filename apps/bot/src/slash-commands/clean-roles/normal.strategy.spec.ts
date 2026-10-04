import { Logger } from '@nestjs/common';
import type { SignupDocument } from '@ulti-project/shared';
import type {
  GuildMember,
  GuildMemberRoleManager,
  Role,
  User,
} from 'discord.js';
import { test as base, describe, expect, vi } from 'vitest';
import { fresh } from '../../test-utils/fixtures.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import type {
  NormalRoleResult,
  ProcessingContext,
} from './clean-roles.interfaces.js';
import { planRoleRemovals } from './clean-roles.utils.js';
import { NormalStrategy } from './normal.strategy.js';

/** Runs the strategy on the plan the handler would make for `roles`. */
const processRoles = (
  strategy: NormalStrategy,
  roles: Role[],
  activeSignupDiscordIds: Set<string>,
) => strategy.processRoles(planRoleRemovals(roles, activeSignupDiscordIds));

const REASON = 'Cleaned by clean-roles command - no active signups';

/** A cached guild member whose role removals resolve, unless Discord rejects them. */
const memberWith = (id: string, { rejectWith }: { rejectWith?: Error } = {}) =>
  mockOf<GuildMember>({
    id,
    displayName: `Nick ${id}`,
    user: mockOf<User>({ username: id }),
    roles: mockOf<GuildMemberRoleManager>({
      remove: rejectWith
        ? vi.fn().mockRejectedValue(rejectWith)
        : vi.fn().mockResolvedValue(undefined),
    }),
  });

/** A role held by `members`, which the bot may remove unless `editable` is false. */
const roleHeldBy = (
  id: string,
  members: GuildMember[],
  { editable = true }: { editable?: boolean } = {},
) =>
  mockOf<Role>({
    id,
    name: `Role ${id}`,
    editable,
    members: new Map(members.map((member) => [member.id, member])),
  });

const removalsOf = (member: GuildMember) =>
  vi.mocked(member.roles.remove).mock.calls;

const it = base.extend<{ strategy: NormalStrategy }>({
  strategy: fresh(() => new NormalStrategy(createAutoMock<Logger>())),
});

describe('NormalStrategy', () => {
  describe('when members without an active signup hold several roles', () => {
    it("removes all of a member's roles in one request, and counts them per role", async ({
      strategy,
    }) => {
      const lapsed = memberWith('lapsed');
      const other = memberWith('other');

      const results = await processRoles(
        strategy,
        [roleHeldBy('r1', [lapsed, other]), roleHeldBy('r2', [lapsed])],
        new Set(),
      );

      expect([results, removalsOf(lapsed), removalsOf(other)]).toEqual([
        [
          {
            roleId: 'r1',
            roleName: 'Role r1',
            membersProcessed: 2,
            rolesRemoved: 2,
            failedRemovals: 0,
            skippedActiveSignups: 0,
          },
          {
            roleId: 'r2',
            roleName: 'Role r2',
            membersProcessed: 1,
            rolesRemoved: 1,
            failedRemovals: 0,
            skippedActiveSignups: 0,
          },
        ],
        [[['r1', 'r2'], REASON]],
        [[['r1'], REASON]],
      ]);
    });
  });

  describe('when a member has an active signup', () => {
    it('leaves their roles, and counts them as kept', async ({ strategy }) => {
      const active = memberWith('active');

      const results = await processRoles(
        strategy,
        [roleHeldBy('r1', [active])],
        new Set([active.id]),
      );

      expect([results, removalsOf(active)]).toEqual([
        [
          {
            roleId: 'r1',
            roleName: 'Role r1',
            membersProcessed: 1,
            rolesRemoved: 0,
            failedRemovals: 0,
            skippedActiveSignups: 1,
          },
        ],
        [],
      ]);
    });
  });

  describe('when the bot may not remove one of the roles', () => {
    it('never requests it, counts it failed, and still removes the others', async ({
      strategy,
    }) => {
      const lapsed = memberWith('lapsed');

      const results = await processRoles(
        strategy,
        [
          roleHeldBy('r1', [lapsed]),
          roleHeldBy('above-bot', [lapsed], { editable: false }),
        ],
        new Set(),
      );

      expect([results, removalsOf(lapsed)]).toEqual([
        [
          {
            roleId: 'r1',
            roleName: 'Role r1',
            membersProcessed: 1,
            rolesRemoved: 1,
            failedRemovals: 0,
            skippedActiveSignups: 0,
          },
          {
            roleId: 'above-bot',
            roleName: 'Role above-bot',
            membersProcessed: 1,
            rolesRemoved: 0,
            failedRemovals: 1,
            skippedActiveSignups: 0,
          },
        ],
        [[['r1'], REASON]],
      ]);
    });
  });

  describe("when Discord rejects a member's removal", () => {
    it("counts each of that member's roles as failed, and the others' as removed", async ({
      strategy,
    }) => {
      const failing = memberWith('failing', {
        rejectWith: new Error('Discord API error'),
      });
      const other = memberWith('other');

      const results = await processRoles(
        strategy,
        [roleHeldBy('r1', [failing, other]), roleHeldBy('r2', [failing])],
        new Set(),
      );

      expect(results).toEqual([
        {
          roleId: 'r1',
          roleName: 'Role r1',
          membersProcessed: 2,
          rolesRemoved: 1,
          failedRemovals: 1,
          skippedActiveSignups: 0,
        },
        {
          roleId: 'r2',
          roleName: 'Role r2',
          membersProcessed: 1,
          rolesRemoved: 0,
          failedRemovals: 1,
          skippedActiveSignups: 0,
        },
      ]);
    });
  });

  describe('when a role has no members', () => {
    it('reports it with nothing processed', async ({ strategy }) => {
      expect(
        await processRoles(strategy, [roleHeldBy('r1', [])], new Set()),
      ).toEqual([
        {
          roleId: 'r1',
          roleName: 'Role r1',
          membersProcessed: 0,
          rolesRemoved: 0,
          failedRemovals: 0,
          skippedActiveSignups: 0,
        },
      ]);
    });
  });

  describe('createResult', () => {
    it('should create normal result with correct totals', ({ strategy }) => {
      const processedRoles: NormalRoleResult[] = [
        {
          roleId: 'role-1',
          roleName: 'Role One',
          membersProcessed: 3,
          rolesRemoved: 2,
          failedRemovals: 0,
          skippedActiveSignups: 0,
        },
        {
          roleId: 'role-2',
          roleName: 'Role Two',
          membersProcessed: 2,
          rolesRemoved: 1,
          failedRemovals: 0,
          skippedActiveSignups: 0,
        },
      ];

      const context: ProcessingContext = {
        plans: [],
        activeSignups: partialMock<SignupDocument[]>([{}, {}, {}]), // 3 active signups
        membersKeepingRoles: new Set(['user-4', 'user-5']), // 2 members keep a role
        allMembersWithRoles: new Set([
          'user-1',
          'user-2',
          'user-3',
          'user-4',
          'user-5',
        ]), // 5 members with roles
      };

      const result = strategy.createResult(context, processedRoles);

      expect(result).toEqual({
        isDryRun: false,
        totalRolesProcessed: 2,
        totalMembersProcessed: 5,
        totalRolesRemoved: 3,
        totalFailedRemovals: 0,
        totalActiveSignups: 3,
        uniqueMembersWithRoles: 5,
        uniqueMembersAfterRemoval: 2, // Only user-4 and user-5 keep a role
        processedRoles,
      });
    });

    it('should handle empty processed roles', ({ strategy }) => {
      const processedRoles: NormalRoleResult[] = [];

      const context: ProcessingContext = {
        plans: [],
        activeSignups: [],
        membersKeepingRoles: new Set(),
        allMembersWithRoles: new Set(),
      };

      const result = strategy.createResult(context, processedRoles);

      expect(result).toEqual({
        isDryRun: false,
        totalRolesProcessed: 0,
        totalMembersProcessed: 0,
        totalRolesRemoved: 0,
        totalFailedRemovals: 0,
        totalActiveSignups: 0,
        uniqueMembersWithRoles: 0,
        uniqueMembersAfterRemoval: 0,
        processedRoles: [],
      });
    });
  });
});
