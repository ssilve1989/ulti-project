import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { HelperTeamCollection } from '../../../firebase/collections/helper-team.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { TeamsCommandHandler } from './teams.command-handler.js';

describe('TeamsCommandHandler', () => {
  let handler: TeamsCommandHandler;
  let helperTeamCollection: Mocked<HelperTeamCollection>;
  let authorizationService: Mocked<HelperTeamAuthorizationService>;
  let discordService: Mocked<DiscordService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TeamsCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TeamsCommandHandler);
    helperTeamCollection = fixture.get(HelperTeamCollection);
    authorizationService = fixture.get(HelperTeamAuthorizationService);
    discordService = fixture.get(DiscordService);

    authorizationService.isCoordinator.mockResolvedValue(true);
  });

  describe('create subcommand', () => {
    it('upserts a new team using memberRoleId as teamId and replies with role mention', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'create',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
          getUser: (name: string) =>
            name === 'leader' ? { id: 'leader-user-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-id',
          teamId: 'member-role-id',
          memberRoleId: 'member-role-id',
          leaderUserId: 'leader-user-id',
          active: true,
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        'Team for <@&member-role-id> created successfully!',
      );
    });
  });

  describe('edit subcommand', () => {
    it('updates leader when leader option is provided', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'member-role-id',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'old-leader-id',
        createdAt: now,
        updatedAt: now,
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'edit',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
          getUser: (name: string) =>
            name === 'leader' ? { id: 'new-leader-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ leaderUserId: 'new-leader-id' }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        'Team for <@&member-role-id> updated.',
      );
    });

    it('keeps existing leader when leader option is not provided', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'member-role-id',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'existing-leader-id',
        createdAt: now,
        updatedAt: now,
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'edit',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ leaderUserId: 'existing-leader-id' }),
      );
    });

    it('replies with error when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'edit',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'role-id', name: 'Unknown Role' }
              : null,
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
      expect(helperTeamCollection.upsert).not.toHaveBeenCalled();
    });
  });

  describe('archive subcommand', () => {
    it('archives the team matching the given role and replies with role mention', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'member-role-id',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'leader-user-id',
        createdAt: now,
        updatedAt: now,
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'archive',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(helperTeamCollection.archive).toHaveBeenCalledWith(
        'guild-id',
        'member-role-id',
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        'Team for <@&member-role-id> archived.',
      );
    });

    it('replies with error when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'archive',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'role-id', name: 'Unknown Role' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
      expect(helperTeamCollection.archive).not.toHaveBeenCalled();
    });
  });

  describe('members subcommand', () => {
    it('shows leader mention and role members in embed with role mention title', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'member-role-id',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'leader-user-id',
        createdAt: now,
        updatedAt: now,
      });

      const mockMember = {
        displayName: 'TestUser',
        user: { id: 'member-1' },
      } as unknown as GuildMember;
      discordService.getMembersWithRole.mockResolvedValue([mockMember]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'members',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(discordService.getMembersWithRole).toHaveBeenCalledWith({
        guildId: 'guild-id',
        roleId: 'member-role-id',
      });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: {
          data: { title: string; fields: { name: string; value: string }[] };
        }[];
      };
      expect(replyArg.embeds[0].data.title).toBe(
        '<@&member-role-id> — Members',
      );
      expect(replyArg.embeds[0].data.fields[0]).toMatchObject({
        name: 'Leader',
        value: '<@leader-user-id>',
      });
    });

    it('shows None for members when no members have the role', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        guildId: 'guild-id',
        teamId: 'member-role-id',
        active: true,
        memberRoleId: 'member-role-id',
        leaderUserId: 'leader-user-id',
        createdAt: now,
        updatedAt: now,
      });

      discordService.getMembersWithRole.mockResolvedValue([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'members',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'member-role-id', name: 'Alpha Member' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: { data: { fields: { name: string; value: string }[] } }[];
      };
      expect(replyArg.embeds[0].data.fields[1]).toMatchObject({
        name: 'Members',
        value: 'None',
      });
    });

    it('replies with error when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'members',
          getRole: (name: string) =>
            name === 'member-role'
              ? { id: 'role-id', name: 'Unknown Role' }
              : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
    });
  });

  describe('view subcommand', () => {
    it('replies with no-teams message when no active teams exist', async () => {
      helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: { getSubcommand: () => 'view' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No active teams found.',
      );
    });

    it('shows fetched role name as field name and leader-first member mentions as value', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
        {
          guildId: 'guild-id',
          teamId: 'role-alpha',
          active: true,
          memberRoleId: 'role-alpha',
          leaderUserId: 'leader-id',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const member1 = { user: { id: 'member-1' } } as unknown as GuildMember;
      discordService.getMembersWithRole.mockResolvedValueOnce([member1]);
      discordService.getRoleName.mockResolvedValueOnce('Alpha Role');

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: { getSubcommand: () => 'view' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(discordService.getRoleName).toHaveBeenCalledWith({
        guildId: 'guild-id',
        roleId: 'role-alpha',
      });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: { data: { fields: { name: string; value: string }[] } }[];
      };
      expect(replyArg.embeds[0].data.fields[0]).toMatchObject({
        name: 'Alpha Role',
        value: '<@leader-id> (Leader)\n<@member-1>',
      });
    });

    it('omits the leader from the non-leader list when the leader holds the role', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
        {
          guildId: 'guild-id',
          teamId: 'role-alpha',
          active: true,
          memberRoleId: 'role-alpha',
          leaderUserId: 'leader-id',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const leaderMember = {
        user: { id: 'leader-id' },
      } as unknown as GuildMember;
      const otherMember = {
        user: { id: 'member-2' },
      } as unknown as GuildMember;
      discordService.getMembersWithRole.mockResolvedValueOnce([
        leaderMember,
        otherMember,
      ]);
      discordService.getRoleName.mockResolvedValueOnce('Alpha Role');

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: { getSubcommand: () => 'view' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: { data: { fields: { name: string; value: string }[] } }[];
      };
      expect(replyArg.embeds[0].data.fields[0].value).toBe(
        '<@leader-id> (Leader)\n<@member-2>',
      );
    });

    it('shows only the leader line when no other members hold the role', async () => {
      const now = Timestamp.now();
      helperTeamCollection.getActiveForGuild.mockResolvedValueOnce([
        {
          guildId: 'guild-id',
          teamId: 'role-alpha',
          active: true,
          memberRoleId: 'role-alpha',
          leaderUserId: 'leader-id',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      discordService.getMembersWithRole.mockResolvedValueOnce([]);
      discordService.getRoleName.mockResolvedValueOnce('Alpha Role');

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: { getSubcommand: () => 'view' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: { data: { fields: { name: string; value: string }[] } }[];
      };
      expect(replyArg.embeds[0].data.fields[0].value).toBe(
        '<@leader-id> (Leader)',
      );
    });
  });

  describe('unknown subcommand', () => {
    it('replies with unknown subcommand for unrecognized input', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'bogus',
          getRole: () => null,
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Unknown subcommand'),
      );
    });
  });

  describe('permission check', () => {
    it('replies with permission denied when user is not a coordinator', async () => {
      authorizationService.isCoordinator.mockResolvedValueOnce(false);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'user-id' },
        options: {
          getSubcommand: () => 'create',
          getRole: () => ({ id: 'role-id', name: 'Role' }),
          getUser: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'You do not have permission to use this command.',
      });
      expect(helperTeamCollection.upsert).not.toHaveBeenCalled();
    });
  });
});
