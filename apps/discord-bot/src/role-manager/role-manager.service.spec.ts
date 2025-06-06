import type { ChatInputCommandInteraction, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleManagerService } from './role-manager.service.js';

describe('RoleManagerService', () => {
  let roleManagerService: RoleManagerService;
  let mockSettingsCollection: any;
  let mockDiscordService: any;
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockSettingsCollection = {
      getSettings: vi.fn(),
    };

    mockDiscordService = {
      userHasRole: vi.fn(),
    };

    mockInteraction = {
      guildId: 'test-guild-id',
      user: {
        id: 'test-user-id',
      } as User,
    } as Partial<ChatInputCommandInteraction>;

    roleManagerService = new RoleManagerService(
      mockSettingsCollection,
      mockDiscordService,
    );
  });

  describe('validateRole', () => {
    it('should return false when settings do not exist', async () => {
      mockSettingsCollection.getSettings.mockResolvedValue(null);

      const result = await roleManagerService.validateRole(
        mockInteraction as ChatInputCommandInteraction<'cached' | 'raw'>,
        'someRole',
      );

      expect(result).toBe(false);
      expect(mockSettingsCollection.getSettings).toHaveBeenCalledWith(
        'test-guild-id',
      );
      expect(mockDiscordService.userHasRole).not.toHaveBeenCalled();
    });

    it('should return false when role key does not exist in settings', async () => {
      mockSettingsCollection.getSettings.mockResolvedValue({
        otherRole: 'some-role-id',
      });

      const result = await roleManagerService.validateRole(
        mockInteraction as ChatInputCommandInteraction<'cached' | 'raw'>,
        'someRole',
      );

      expect(result).toBe(false);
      expect(mockSettingsCollection.getSettings).toHaveBeenCalledWith(
        'test-guild-id',
      );
      expect(mockDiscordService.userHasRole).not.toHaveBeenCalled();
    });

    it('should return true when user has the required role', async () => {
      mockSettingsCollection.getSettings.mockResolvedValue({
        someRole: 'role-id',
      });
      mockDiscordService.userHasRole.mockResolvedValue(true);

      const result = await roleManagerService.validateRole(
        mockInteraction as ChatInputCommandInteraction<'cached' | 'raw'>,
        'someRole',
      );

      expect(result).toBe(true);
      expect(mockDiscordService.userHasRole).toHaveBeenCalledWith({
        userId: 'test-user-id',
        roleId: 'role-id',
        guildId: 'test-guild-id',
      });
    });

    it('should return false when user does not have the required role', async () => {
      mockSettingsCollection.getSettings.mockResolvedValue({
        someRole: 'role-id',
      });
      mockDiscordService.userHasRole.mockResolvedValue(false);

      const result = await roleManagerService.validateRole(
        mockInteraction as ChatInputCommandInteraction<'cached' | 'raw'>,
        'someRole',
      );

      expect(result).toBe(false);
      expect(mockDiscordService.userHasRole).toHaveBeenCalledWith({
        userId: 'test-user-id',
        roleId: 'role-id',
        guildId: 'test-guild-id',
      });
    });
  });
});
