import { createMock } from '@golevelup/ts-vitest';
import { Logger } from '@nestjs/common';
import { GuildMember, Role, User } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  DryRunRoleResult,
  ProcessingContext,
} from './clean-roles.interfaces.js';
import { DryRunStrategy } from './dry-run.strategy.js';

describe('DryRunStrategy', () => {
  let strategy: DryRunStrategy;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMock<Logger>();
    strategy = new DryRunStrategy(mockLogger);
  });

  describe('processRole', () => {
    it('should process role and return dry run result with members to remove', async () => {
      const mockUser1 = { username: 'user1' } as User;
      const mockUser2 = { username: 'user2' } as User;

      const mockMember1 = {
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
      } as GuildMember;

      const mockMember2 = {
        id: 'member-2',
        displayName: 'Member Two',
        user: mockUser2,
      } as GuildMember;

      const mockRole = {
        id: 'role-1',
        name: 'Test Role',
        members: new Map([
          ['member-1', mockMember1],
          ['member-2', mockMember2],
        ]),
      } as unknown as Role;

      const activeSignupDiscordIds = new Set(['member-1']); // Only member-1 has active signup

      const result = await strategy.processRole(
        mockRole,
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Test Role',
        membersProcessed: 2,
        rolesRemoved: 1,
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
      const mockRole = {
        id: 'role-1',
        name: 'Empty Role',
        members: new Map(),
      } as unknown as Role;

      const activeSignupDiscordIds = new Set<string>();

      const result = await strategy.processRole(
        mockRole,
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Empty Role',
        membersProcessed: 0,
        rolesRemoved: 0,
        membersToRemove: [],
      });
    });

    it('should not remove members with active signups', async () => {
      const mockUser1 = { username: 'user1' } as User;
      const mockMember1 = {
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
      } as GuildMember;

      const mockRole = {
        id: 'role-1',
        name: 'Test Role',
        members: new Map([['member-1', mockMember1]]),
      } as unknown as Role;

      const activeSignupDiscordIds = new Set(['member-1']); // Member has active signup

      const result = await strategy.processRole(
        mockRole,
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Test Role',
        membersProcessed: 1,
        rolesRemoved: 0,
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
          membersToRemove: [
            { id: 'user-3', displayName: 'User Three', username: 'user3' },
          ],
        },
      ];

      const context: ProcessingContext = {
        guild: {} as any,
        guildId: 'guild-1',
        allRoleIds: new Set(['role-1', 'role-2']),
        activeSignups: [{}, {}, {}] as any[], // 3 active signups
        activeSignupDiscordIds: new Set(['user-4', 'user-5']), // 2 unique Discord IDs with signups
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
        totalMembersProcessed: 5,
        totalRolesRemoved: 3,
        totalActiveSignups: 3,
        uniqueMembersWithRoles: 5,
        uniqueMembersAfterRemoval: 2, // Only user-4 and user-5 have active signups
        processedRoles,
      });
    });

    it('should handle empty processed roles', () => {
      const processedRoles: DryRunRoleResult[] = [];

      const context: ProcessingContext = {
        guild: {} as any,
        guildId: 'guild-1',
        allRoleIds: new Set(),
        activeSignups: [] as any[],
        activeSignupDiscordIds: new Set(),
        allMembersWithRoles: new Set(),
      };

      const result = strategy.createResult(context, processedRoles);

      expect(result).toEqual({
        isDryRun: true,
        totalRolesProcessed: 0,
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
