import { createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageFlags,
  Role,
  User,
} from 'discord.js';
import { DiscordService } from '../../discord/discord.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SignupStatus } from '../../firebase/models/signup.model.js';
import { CleanRolesCommand } from './clean-roles.command.js';
import { CleanRolesCommandHandler } from './clean-roles.command-handler.js';

describe('CleanRolesCommandHandler', () => {
  let handler: CleanRolesCommandHandler;
  let discordService: DiscordService;
  let settingsCollection: SettingsCollection;
  let signupCollection: SignupCollection;
  let errorService: ErrorService;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [CleanRolesCommandHandler],
    })
      .useMocker(createMock)
      .compile();

    handler = fixture.get(CleanRolesCommandHandler);
    discordService = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    signupCollection = fixture.get(SignupCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('execute', () => {
    const createInteractionMock = (
      options: { guildId?: string; dryRun?: boolean } = {},
    ) => {
      const { guildId = 'guild-123', dryRun = false } = options;

      const deferReply = vi.fn().mockResolvedValue(undefined);
      const editReply = vi.fn().mockResolvedValue(undefined);

      const mock = {
        deferReply,
        editReply,
        guildId,
        options: {
          getBoolean: vi.fn().mockReturnValue(dryRun),
        },
      } as unknown as ChatInputCommandInteraction<'cached'>;

      return {
        mock,
        deferReply,
        editReply,
      };
    };

    const createMockSettings = () => ({
      progRoles: {
        'ultimate-coil': 'prog-role-1',
        'savage-tier': 'prog-role-2',
      },
      clearRoles: {
        'ultimate-coil': 'clear-role-1',
        'savage-tier': 'clear-role-2',
      },
    });

    const createMockSignups = () => [
      { discordId: 'user-1', status: SignupStatus.APPROVED },
      { discordId: 'user-2', status: SignupStatus.UPDATE_PENDING },
      { discordId: 'user-3', status: SignupStatus.APPROVED },
    ];

    const createMockGuild = () => {
      const mockUser1 = { username: 'userone' } as User;
      const mockUser2 = { username: 'userfour' } as User;

      const mockMember1 = {
        id: 'user-1',
        displayName: 'User One',
        user: mockUser1,
        roles: { remove: vi.fn().mockResolvedValue(undefined) },
      } as unknown as GuildMember;

      const mockMember2 = {
        id: 'user-4', // No active signup
        displayName: 'User Four',
        user: mockUser2,
        roles: { remove: vi.fn().mockResolvedValue(undefined) },
      } as unknown as GuildMember;

      const mockRole = {
        id: 'prog-role-1',
        name: 'Ultimate Prog',
        members: new Map([
          ['user-1', mockMember1],
          ['user-4', mockMember2],
        ]),
      } as unknown as Role;

      return {
        roles: {
          fetch: vi.fn().mockResolvedValue(mockRole),
        },
        members: {
          fetch: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as Guild;
    };

    beforeEach(() => {
      settingsCollection.getSettings = vi
        .fn()
        .mockResolvedValue(createMockSettings());
      signupCollection.findByStatusIn = vi
        .fn()
        .mockResolvedValue(createMockSignups());
      Object.defineProperty(discordService, 'client', {
        value: {
          guilds: {
            fetch: vi.fn().mockResolvedValue(createMockGuild()),
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should handle settings with no roles configured', async () => {
      const mockErrorEmbed = createMock<EmbedBuilder>();

      settingsCollection.getSettings = vi.fn().mockResolvedValue({});
      errorService.handleCommandError = vi.fn().mockReturnValue(mockErrorEmbed);

      const { mock, editReply } = createInteractionMock();

      await handler.execute(new CleanRolesCommand(mock));

      expect(errorService.handleCommandError).toHaveBeenCalledWith(
        expect.any(Error),
        mock,
      );
      expect(editReply).toHaveBeenCalledWith({ embeds: [mockErrorEmbed] });
    });

    it('should handle empty role configuration', async () => {
      const mockErrorEmbed = createMock<EmbedBuilder>();

      settingsCollection.getSettings = vi.fn().mockResolvedValue({
        progRoles: {},
        clearRoles: {},
      });
      errorService.handleCommandError = vi.fn().mockReturnValue(mockErrorEmbed);

      const { mock, editReply } = createInteractionMock();

      await handler.execute(new CleanRolesCommand(mock));

      expect(errorService.handleCommandError).toHaveBeenCalledWith(
        expect.any(Error),
        mock,
      );
      expect(editReply).toHaveBeenCalledWith({ embeds: [mockErrorEmbed] });
    });

    it('should execute in normal mode and remove roles', async () => {
      const { mock, deferReply, editReply } = createInteractionMock({
        dryRun: false,
      });

      await handler.execute(new CleanRolesCommand(mock));

      expect(deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
      expect(signupCollection.findByStatusIn).toHaveBeenCalledWith([
        SignupStatus.APPROVED,
        SignupStatus.UPDATE_PENDING,
      ]);
      expect(editReply).toHaveBeenCalledWith(
        expect.stringContaining('Clean Roles Summary'),
      );
    });

    it('should execute in dry-run mode and show embed preview', async () => {
      const { mock, deferReply, editReply } = createInteractionMock({
        dryRun: true,
      });

      await handler.execute(new CleanRolesCommand(mock));

      expect(deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
      expect(editReply).toHaveBeenCalledWith({
        embeds: [expect.any(EmbedBuilder)],
      });
    });

    it('should handle errors gracefully', async () => {
      const { mock, editReply } = createInteractionMock();
      const error = new Error('Database error');
      const mockErrorEmbed = createMock<EmbedBuilder>();

      settingsCollection.getSettings = vi.fn().mockRejectedValue(error);
      errorService.handleCommandError = vi.fn().mockReturnValue(mockErrorEmbed);

      await handler.execute(new CleanRolesCommand(mock));

      expect(errorService.handleCommandError).toHaveBeenCalledWith(error, mock);
      expect(editReply).toHaveBeenCalledWith({ embeds: [mockErrorEmbed] });
    });

    it('should handle settings-related errors with specific message', async () => {
      const { mock, editReply } = createInteractionMock();
      const error = new Error('No clear/prog roles configured in settings');
      const mockErrorEmbed = createMock<EmbedBuilder>();

      settingsCollection.getSettings = vi.fn().mockRejectedValue(error);
      errorService.handleCommandError = vi.fn().mockReturnValue(mockErrorEmbed);

      await handler.execute(new CleanRolesCommand(mock));

      expect(errorService.handleCommandError).toHaveBeenCalledWith(error, mock);
      expect(editReply).toHaveBeenCalledWith({ embeds: [mockErrorEmbed] });
    });
  });

  describe('createDryRunEmbed', () => {
    it('should create embed with correct statistics', () => {
      const result = {
        isDryRun: true as const,
        totalRolesProcessed: 2,
        totalMembersProcessed: 5,
        totalRolesRemoved: 3,
        totalActiveSignups: 10,
        uniqueMembersWithRoles: 15,
        uniqueMembersAfterRemoval: 10,
        processedRoles: [
          {
            roleId: 'role-1',
            roleName: 'Test Role',
            membersProcessed: 3,
            rolesRemoved: 2,
            membersToRemove: [
              { id: 'user-1', displayName: 'User One', username: 'userone' },
              { id: 'user-2', displayName: 'User Two', username: 'usertwo' },
            ],
          },
        ],
      };

      const embed = handler['createDryRunEmbed'](result);

      expect(embed).toBeInstanceOf(EmbedBuilder);
      expect(embed.data.title).toBe('🔍 Clean Roles - Dry Run Preview');
      expect(embed.data.color).toBe(0x3498db);
      expect(embed.data.fields).toHaveLength(4); // Summary, Member Analysis, Validation, Role details
    });

    it('should show validation pass when members after removal <= active signups', () => {
      const result = {
        isDryRun: true as const,
        totalRolesProcessed: 1,
        totalMembersProcessed: 1,
        totalRolesRemoved: 1,
        totalActiveSignups: 10,
        uniqueMembersWithRoles: 11,
        uniqueMembersAfterRemoval: 10,
        processedRoles: [],
      };

      const embed = handler['createDryRunEmbed'](result);
      const validationField = embed.data.fields?.find((f) =>
        f.name?.includes('Validation'),
      );

      expect(validationField?.name).toContain('✅');
      expect(validationField?.value).toContain('PASS');
    });

    it('should show validation warning when members after removal > active signups', () => {
      const result = {
        isDryRun: true as const,
        totalRolesProcessed: 1,
        totalMembersProcessed: 1,
        totalRolesRemoved: 1,
        totalActiveSignups: 5,
        uniqueMembersWithRoles: 10,
        uniqueMembersAfterRemoval: 8,
        processedRoles: [],
      };

      const embed = handler['createDryRunEmbed'](result);
      const validationField = embed.data.fields?.find((f) =>
        f.name?.includes('Validation'),
      );

      expect(validationField?.name).toContain('⚠️');
      expect(validationField?.value).toContain('FAIL');
    });

    it('should handle no changes required scenario', () => {
      const result = {
        isDryRun: true as const,
        totalRolesProcessed: 2,
        totalMembersProcessed: 5,
        totalRolesRemoved: 0,
        totalActiveSignups: 10,
        uniqueMembersWithRoles: 10,
        uniqueMembersAfterRemoval: 10,
        processedRoles: [],
      };

      const embed = handler['createDryRunEmbed'](result);
      const noChangesField = embed.data.fields?.find((f) =>
        f.name?.includes('No Changes'),
      );

      expect(noChangesField).toBeDefined();
      expect(noChangesField?.value).toContain(
        'All members with clear/prog roles have active signups!',
      );
    });
  });

  describe('createSummaryMessage', () => {
    it('should create summary message with role details', () => {
      const result = {
        isDryRun: false as const,
        totalRolesProcessed: 2,
        totalMembersProcessed: 5,
        totalRolesRemoved: 3,
        totalActiveSignups: 10,
        uniqueMembersWithRoles: 15,
        uniqueMembersAfterRemoval: 10,
        processedRoles: [
          {
            roleId: 'role-1',
            roleName: 'Test Role',
            membersProcessed: 3,
            rolesRemoved: 2,
          },
          {
            roleId: 'role-2',
            roleName: 'Another Role',
            membersProcessed: 2,
            rolesRemoved: 1,
          },
        ],
      };

      const summary = handler['createSummaryMessage'](result);

      expect(summary).toContain('Clean Roles Summary');
      expect(summary).toContain('**Total Roles Processed:** 2');
      expect(summary).toContain('**Total Members Processed:** 5');
      expect(summary).toContain('**Total Roles Removed:** 3');
      expect(summary).toContain('**Test Role**: 2/3 removed');
      expect(summary).toContain('**Another Role**: 1/2 removed');
    });

    it('should show success message when no roles removed', () => {
      const result = {
        isDryRun: false as const,
        totalRolesProcessed: 2,
        totalMembersProcessed: 5,
        totalRolesRemoved: 0,
        totalActiveSignups: 10,
        uniqueMembersWithRoles: 15,
        uniqueMembersAfterRemoval: 15,
        processedRoles: [
          {
            roleId: 'role-1',
            roleName: 'Test Role',
            membersProcessed: 3,
            rolesRemoved: 0,
          },
        ],
      };

      const summary = handler['createSummaryMessage'](result);

      expect(summary).toContain(
        'All members with clear/prog roles have active signups!',
      );
    });

    it('should show completion message when roles were removed', () => {
      const result = {
        isDryRun: false as const,
        totalRolesProcessed: 1,
        totalMembersProcessed: 3,
        totalRolesRemoved: 2,
        totalActiveSignups: 10,
        uniqueMembersWithRoles: 15,
        uniqueMembersAfterRemoval: 13,
        processedRoles: [
          {
            roleId: 'role-1',
            roleName: 'Test Role',
            membersProcessed: 3,
            rolesRemoved: 2,
          },
        ],
      };

      const summary = handler['createSummaryMessage'](result);

      expect(summary).toContain('Role cleanup completed successfully!');
    });
  });

  describe('collectMembersWithRoles', () => {
    it('should collect unique member IDs from all roles', async () => {
      const mockGuild = {
        roles: {
          fetch: vi
            .fn()
            .mockResolvedValueOnce({
              members: new Map([
                ['user-1', { id: 'user-1' }],
                ['user-2', { id: 'user-2' }],
              ]),
            })
            .mockResolvedValueOnce({
              members: new Map([
                ['user-2', { id: 'user-2' }], // Duplicate
                ['user-3', { id: 'user-3' }],
              ]),
            }),
        },
      } as unknown as Guild;

      const roleIds = new Set(['role-1', 'role-2']);
      const members = await handler['collectMembersWithRoles'](
        mockGuild,
        roleIds,
      );

      expect(members).toEqual(new Set(['user-1', 'user-2', 'user-3']));
      expect(mockGuild.roles.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle roles that do not exist', async () => {
      const mockGuild = {
        roles: {
          fetch: vi
            .fn()
            .mockResolvedValueOnce({
              members: new Map([['user-1', { id: 'user-1' }]]),
            })
            .mockResolvedValueOnce(null), // Role not found
        },
      } as unknown as Guild;

      const roleIds = new Set(['role-1', 'nonexistent-role']);
      const members = await handler['collectMembersWithRoles'](
        mockGuild,
        roleIds,
      );

      expect(members).toEqual(new Set(['user-1']));
    });
  });
});
