import { Test, type TestingModule } from '@nestjs/testing';
import { Collection, DiscordAPIError } from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DISCORD_CLIENT } from './discord.decorators.js';
import { DiscordService } from './discord.service.js';

describe('DiscordService', () => {
  let service: DiscordService;
  let mockGuildsCache: Collection<
    string,
    { id: string; members?: { fetch: ReturnType<typeof vi.fn> } }
  >;
  let mockEmojisCache: Collection<string, { id: string; name?: string }>;
  let mockGuildsFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockGuildsCache = new Collection();
    mockEmojisCache = new Collection();
    mockGuildsFetch = vi.fn();

    const mockClient = {
      guilds: {
        cache: mockGuildsCache,
        fetch: mockGuildsFetch,
      },
      emojis: {
        cache: mockEmojisCache,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        {
          provide: DISCORD_CLIENT,
          useValue: mockClient,
        },
      ],
    }).compile();

    service = module.get<DiscordService>(DiscordService);
  });

  describe('getGuilds', () => {
    test('should return array of guild IDs from cache', () => {
      // Only add the properties that getGuilds() actually uses
      mockGuildsCache.set('guild-1', { id: 'guild-1' });
      mockGuildsCache.set('guild-2', { id: 'guild-2' });

      const result = service.getGuilds();

      expect(result).toEqual(['guild-1', 'guild-2']);
    });

    test('should return empty array when no guilds in cache', () => {
      const result = service.getGuilds();

      expect(result).toEqual([]);
    });
  });

  describe('getGuildMember', () => {
    test('should return undefined for unknown member error (code 10007)', async () => {
      const mockMembersFetch = vi.fn().mockRejectedValue(
        new DiscordAPIError(
          {
            message: 'Unknown Member',
            code: 10007,
          },
          10007,
          404,
          'GET',
          '',
          {},
        ),
      );

      // Add guild object with only the members.fetch method the service uses
      mockGuildsCache.set('guild-1', {
        id: 'guild-1',
        members: {
          fetch: mockMembersFetch,
        },
      });

      const result = await service.getGuildMember({
        memberId: 'user-1',
        guildId: 'guild-1',
      });

      expect(result).toBeUndefined();
      expect(mockMembersFetch).toHaveBeenCalledWith('user-1');
    });

    test('should rethrow non-unknown-member errors', async () => {
      const customError = new Error('API Error');
      const mockMembersFetch = vi.fn().mockRejectedValue(customError);

      mockGuildsCache.set('guild-1', {
        id: 'guild-1',
        members: {
          fetch: mockMembersFetch,
        },
      });

      await expect(
        service.getGuildMember({
          memberId: 'user-1',
          guildId: 'guild-1',
        }),
      ).rejects.toThrow('API Error');
    });
  });

  describe('getEmojiString', () => {
    test('should return emoji string when emoji exists in cache', () => {
      // Only add the id property that the service uses
      mockEmojisCache.set('emoji-123', { id: 'emoji-123' });

      const result = service.getEmojiString('emoji-123');

      expect(result).toBe('<:_:emoji-123>');
    });

    test('should return empty string when emoji does not exist in cache', () => {
      const result = service.getEmojiString('nonexistent-emoji');

      expect(result).toBe('');
    });
  });

  describe('getEmojis', () => {
    test('should return array of emojis that exist in cache', () => {
      // Add objects with only the properties the service uses
      const emoji1 = { name: 'smile', id: 'emoji-1' };
      const emoji2 = { name: 'heart', id: 'emoji-2' };
      const emoji3 = { name: 'star', id: 'emoji-3' };

      mockEmojisCache.set('emoji-1', emoji1);
      mockEmojisCache.set('emoji-2', emoji2);
      mockEmojisCache.set('emoji-3', emoji3);

      const result = service.getEmojis(['smile', 'nonexistent', 'heart']);

      expect(result).toEqual([emoji1, emoji2]);
    });

    test('should return empty array when no emojis match', () => {
      const result = service.getEmojis(['nonexistent1', 'nonexistent2']);

      expect(result).toEqual([]);
    });

    test('should return empty array for empty input', () => {
      const result = service.getEmojis([]);

      expect(result).toEqual([]);
    });
  });

  describe('removeRole', () => {
    test('should return 0 and log warning when role not found', async () => {
      const logSpy = vi
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => {});

      const mockMembersFetch = vi.fn();
      const mockRolesFetch = vi.fn().mockResolvedValue(null);

      // Mock the guild object with only what the service uses
      const mockGuild = {
        members: { fetch: mockMembersFetch },
        roles: { fetch: mockRolesFetch },
      };

      mockGuildsFetch.mockResolvedValue(mockGuild);

      const result = await service.removeRole('guild-1', 'role-1');

      expect(result).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        'role role-1 not found in guild guild-1',
      );
    });

    test('should return member count when role exists', async () => {
      const logSpy = vi
        .spyOn(service['logger'], 'log')
        .mockImplementation(() => {});

      // Create mock members with only the properties the service uses
      const mockMember1 = {
        displayName: 'User 1',
        roles: { remove: vi.fn().mockResolvedValue(undefined) },
      };

      const mockMember2 = {
        displayName: 'User 2',
        roles: { remove: vi.fn().mockResolvedValue(undefined) },
      };

      const mockMembers = new Collection([
        ['user-1', mockMember1],
        ['user-2', mockMember2],
      ]);

      // Create mock role with only what the service uses
      const mockRole = {
        name: 'Test Role',
        members: mockMembers,
      };

      const mockMembersFetch = vi.fn();
      const mockRolesFetch = vi.fn().mockResolvedValue(mockRole);

      const mockGuild = {
        members: { fetch: mockMembersFetch },
        roles: { fetch: mockRolesFetch },
      };

      mockGuildsFetch.mockResolvedValue(mockGuild);

      const result = await service.removeRole('guild-1', 'role-1');

      expect(result).toBe(2);
      expect(logSpy).toHaveBeenCalledWith(
        'found 2 members with role Test Role',
      );
    });
  });
});
