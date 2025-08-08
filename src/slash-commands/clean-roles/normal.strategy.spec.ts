import { Logger } from '@nestjs/common';
import { GuildMember, GuildMemberRoleManager, Role, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NormalRoleResult,
  ProcessingContext,
} from './clean-roles.interfaces.js';
import { NormalStrategy } from './normal.strategy.js';

describe('NormalStrategy', () => {
  let strategy: NormalStrategy;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    } as any;
    strategy = new NormalStrategy(mockLogger);
  });

  describe('processRole', () => {
    it('should process role and remove roles from members without active signups', async () => {
      const mockUser1 = { username: 'user1' } as User;
      const mockUser2 = { username: 'user2' } as User;

      const mockRoleManager1 = {
        remove: vi.fn().mockResolvedValue(undefined),
      } as unknown as GuildMemberRoleManager;

      const mockRoleManager2 = {
        remove: vi.fn().mockResolvedValue(undefined),
      } as unknown as GuildMemberRoleManager;

      const mockMember1 = {
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
        roles: mockRoleManager1,
      } as GuildMember;

      const mockMember2 = {
        id: 'member-2',
        displayName: 'Member Two',
        user: mockUser2,
        roles: mockRoleManager2,
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
      });

      // Should not remove role from member-1 (has active signup)
      expect(mockRoleManager1.remove).not.toHaveBeenCalled();

      // Should remove role from member-2 (no active signup)
      expect(mockRoleManager2.remove).toHaveBeenCalledWith(
        'role-1',
        'Cleaned by clean-roles command - no active signups',
      );
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
      });
    });

    it('should not remove roles from members with active signups', async () => {
      const mockUser1 = { username: 'user1' } as User;
      const mockRoleManager1 = {
        remove: vi.fn().mockResolvedValue(undefined),
      } as unknown as GuildMemberRoleManager;

      const mockMember1 = {
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
        roles: mockRoleManager1,
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
      });

      expect(mockRoleManager1.remove).not.toHaveBeenCalled();
    });

    it('should handle role removal errors gracefully', async () => {
      const mockUser1 = { username: 'user1' } as User;
      const mockRoleManager1 = {
        remove: vi.fn().mockRejectedValue(new Error('Discord API error')),
      } as unknown as GuildMemberRoleManager;

      const mockMember1 = {
        id: 'member-1',
        displayName: 'Member One',
        user: mockUser1,
        roles: mockRoleManager1,
      } as GuildMember;

      const mockRole = {
        id: 'role-1',
        name: 'Test Role',
        members: new Map([['member-1', mockMember1]]),
      } as unknown as Role;

      const activeSignupDiscordIds = new Set<string>(); // No active signups

      const result = await strategy.processRole(
        mockRole,
        activeSignupDiscordIds,
      );

      expect(result).toEqual({
        roleId: 'role-1',
        roleName: 'Test Role',
        membersProcessed: 1,
        rolesRemoved: 0, // Should be 0 because the removal failed
      });

      expect(mockRoleManager1.remove).toHaveBeenCalledWith(
        'role-1',
        'Cleaned by clean-roles command - no active signups',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createResult', () => {
    it('should create normal result with correct totals', () => {
      const processedRoles: NormalRoleResult[] = [
        {
          roleId: 'role-1',
          roleName: 'Role One',
          membersProcessed: 3,
          rolesRemoved: 2,
        },
        {
          roleId: 'role-2',
          roleName: 'Role Two',
          membersProcessed: 2,
          rolesRemoved: 1,
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
        isDryRun: false,
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
      const processedRoles: NormalRoleResult[] = [];

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
        isDryRun: false,
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
