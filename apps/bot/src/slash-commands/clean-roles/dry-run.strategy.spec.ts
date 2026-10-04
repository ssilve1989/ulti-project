import { Logger } from '@nestjs/common';
import type { SignupDocument } from '@ulti-project/shared';
import type { GuildMember, Role, User } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import type {
  DryRunRoleResult,
  ProcessingContext,
} from './clean-roles.interfaces.js';
import { planRoleRemovals } from './clean-roles.utils.js';
import { DryRunStrategy } from './dry-run.strategy.js';

/** Runs the strategy on the plan the handler would make for `roles`. */
const processRoles = (
  strategy: DryRunStrategy,
  roles: Role[],
  activeSignupDiscordIds: Set<string>,
) => strategy.processRoles(planRoleRemovals(roles, activeSignupDiscordIds));

describe('DryRunStrategy', () => {
  let strategy: DryRunStrategy;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createAutoMock<Logger>();
    strategy = new DryRunStrategy(mockLogger);
  });

  describe('processRoles', () => {
    it('should process role and return dry run result with members to remove', async () => {
      const mockUser1 = mockOf<User>({ username: 'user1' });
      const mockUser2 = mockOf<User>({ username: 'user2' });

      const mockMember1 = mockOf<GuildMember>({
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
      });

      const mockMember2 = mockOf<GuildMember>({
        id: 'member-2',
        displayName: 'Member Two',
        user: mockUser2,
      });

      const mockRole = mockOf<Role>({
        id: 'role-1',
        editable: true,
        name: 'Test Role',
        members: new Map([
          ['member-1', mockMember1],
          ['member-2', mockMember2],
        ]),
      });

      const activeSignupDiscordIds = new Set(['member-1']); // Only member-1 has active signup

      const [result] = await processRoles(
        strategy,
        [mockRole],
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Test Role',
        membersProcessed: 2,
        rolesRemoved: 1,
        unremovable: 0,
        membersToRemove: [
          {
            id: 'member-2',
            displayName: 'Member Two',
            username: 'user2',
          },
        ],
      });
    });

    it('should handle empty role', async () => {
      const mockRole = mockOf<Role>({
        id: 'role-1',
        editable: true,
        name: 'Empty Role',
        members: new Map(),
      });

      const activeSignupDiscordIds = new Set<string>();

      const [result] = await processRoles(
        strategy,
        [mockRole],
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Empty Role',
        membersProcessed: 0,
        rolesRemoved: 0,
        unremovable: 0,
        membersToRemove: [],
      });
    });

    it('should not remove members with active signups', async () => {
      const mockUser1 = mockOf<User>({ username: 'user1' });
      const mockMember1 = mockOf<GuildMember>({
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
      });

      const mockRole = mockOf<Role>({
        id: 'role-1',
        editable: true,
        name: 'Test Role',
        members: new Map([['member-1', mockMember1]]),
      });

      const activeSignupDiscordIds = new Set(['member-1']); // Member has active signup

      const [result] = await processRoles(
        strategy,
        [mockRole],
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Test Role',
        membersProcessed: 1,
        rolesRemoved: 0,
        unremovable: 0,
        membersToRemove: [],
      });
    });

    it('counts holders of a role the bot may not remove instead of listing them', async () => {
      const mockMember1 = mockOf<GuildMember>({
        id: 'member-1',
        displayName: 'Member One',
        user: mockOf<User>({ username: 'user1' }),
      });

      const mockRole = mockOf<Role>({
        id: 'role-1',
        name: 'Above Bot',
        editable: false,
        members: new Map([['member-1', mockMember1]]),
      });

      const [result] = await processRoles(strategy, [mockRole], new Set());

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Above Bot',
        membersProcessed: 1,
        rolesRemoved: 0,
        unremovable: 1,
        membersToRemove: [],
      });
    });
  });

  describe('createResult', () => {
    it('should create dry run result with correct totals', () => {
      const processedRoles: DryRunRoleResult[] = [
        {
          roleId: 'role-1',
          roleName: 'Role One',
          membersProcessed: 3,
          rolesRemoved: 2,
          unremovable: 0,
          membersToRemove: [
            { id: 'user-1', displayName: 'User One', username: 'user1' },
            { id: 'user-2', displayName: 'User Two', username: 'user2' },
          ],
        },
        {
          roleId: 'role-2',
          roleName: 'Role Two',
          membersProcessed: 2,
          rolesRemoved: 1,
          unremovable: 0,
          membersToRemove: [
            { id: 'user-3', displayName: 'User Three', username: 'user3' },
          ],
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
        isDryRun: true,
        totalRolesProcessed: 2,
        totalUnremovable: 0,
        totalMembersProcessed: 5,
        totalRolesRemoved: 3,
        totalActiveSignups: 3,
        uniqueMembersWithRoles: 5,
        uniqueMembersAfterRemoval: 2, // Only user-4 and user-5 keep a role
        processedRoles,
      });
    });

    it('should handle empty processed roles', () => {
      const processedRoles: DryRunRoleResult[] = [];

      const context: ProcessingContext = {
        plans: [],
        activeSignups: [],
        membersKeepingRoles: new Set(),
        allMembersWithRoles: new Set(),
      };

      const result = strategy.createResult(context, processedRoles);

      expect(result).toEqual({
        isDryRun: true,
        totalRolesProcessed: 0,
        totalUnremovable: 0,
        totalMembersProcessed: 0,
        totalRolesRemoved: 0,
        totalActiveSignups: 0,
        uniqueMembersWithRoles: 0,
        uniqueMembersAfterRemoval: 0,
        processedRoles: [],
      });
    });
  });
});
