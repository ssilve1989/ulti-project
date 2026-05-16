import { Test } from '@nestjs/testing';
import {
  type ChatInputCommandInteraction,
  DiscordjsErrorCodes,
  type GuildMember,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { HelperTeamCollection } from '../../../firebase/collections/helper-team.collection.js';
import { HelperTeamSessionCollection } from '../../../firebase/collections/helper-team-session.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { TeamsCommandHandler } from './teams.command-handler.js';

describe('TeamsCommandHandler', () => {
  let handler: TeamsCommandHandler;
  let helperTeamCollection: Mocked<HelperTeamCollection>;
  let sessionCollection: Mocked<HelperTeamSessionCollection>;
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
    sessionCollection = fixture.get(HelperTeamSessionCollection);
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

  describe('schedule-add subcommand', () => {
    const now = Timestamp.now();
    const team = {
      guildId: 'guild-id',
      teamId: 'member-role-id',
      active: true,
      memberRoleId: 'member-role-id',
      leaderUserId: 'coordinator-id', // matches interaction.user.id
      createdAt: now,
      updatedAt: now,
    };

    it('upserts a new session and replies with day/time summary', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-add',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: (name: string) => {
            if (name === 'day-of-week') return 5;
            if (name === 'duration-minutes') return 120;
            return null;
          },
          getString: (name: string) => {
            if (name === 'start-time') return '20:00';
            if (name === 'timezone') return 'America/Denver';
            return null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(sessionCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-id',
          teamId: 'member-role-id',
          active: true,
          dayOfWeek: 5,
          startTime: '20:00',
          durationMinutes: 120,
          timezone: 'America/Denver',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('Fri'),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('20:00'),
      );
    });

    it('rejects with invalid-time error before any Firestore reads', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-add',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: (name: string) => {
            if (name === 'day-of-week') return 5;
            if (name === 'duration-minutes') return 120;
            return null;
          },
          getString: (name: string) => {
            if (name === 'start-time') return 'bad-time';
            if (name === 'timezone') return 'America/Denver';
            return null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'Invalid start time. Use HH:mm format (e.g. 20:00).',
      );
      expect(helperTeamCollection.getByMemberRole).not.toHaveBeenCalled();
      expect(sessionCollection.upsert).not.toHaveBeenCalled();
    });

    it('rejects when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-add',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'role-id' } : null,
          getInteger: (name: string) => {
            if (name === 'day-of-week') return 1;
            if (name === 'duration-minutes') return 60;
            return null;
          },
          getString: (name: string) => {
            if (name === 'start-time') return '19:00';
            if (name === 'timezone') return 'UTC';
            return null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
      expect(sessionCollection.upsert).not.toHaveBeenCalled();
    });

    it('rejects when coordinator is not the team leader', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        ...team,
        leaderUserId: 'someone-else-id',
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-add',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: (name: string) => {
            if (name === 'day-of-week') return 5;
            if (name === 'duration-minutes') return 120;
            return null;
          },
          getString: (name: string) => {
            if (name === 'start-time') return '20:00';
            if (name === 'timezone') return 'America/Denver';
            return null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'You are not the leader of the <@&member-role-id> team.',
      );
      expect(sessionCollection.upsert).not.toHaveBeenCalled();
    });
  });

  describe('schedule-list subcommand', () => {
    const now = Timestamp.now();
    const team = {
      guildId: 'guild-id',
      teamId: 'member-role-id',
      active: true,
      memberRoleId: 'member-role-id',
      leaderUserId: 'coordinator-id',
      createdAt: now,
      updatedAt: now,
    };
    const session = {
      guildId: 'guild-id',
      sessionId: 's1',
      teamId: 'member-role-id',
      active: true,
      dayOfWeek: 5 as const,
      startTime: '20:00',
      durationMinutes: 120,
      timezone: 'America/Denver',
      createdAt: now,
      updatedAt: now,
    };

    it('returns an embed with one field per session', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-list',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(sessionCollection.getActiveForTeams).toHaveBeenCalledWith(
        'guild-id',
        ['member-role-id'],
      );

      const replyArg = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        embeds: {
          data: { title: string; fields: { name: string; value: string }[] };
        }[];
      };
      expect(replyArg.embeds[0].data.title).toContain('member-role-id');
      expect(replyArg.embeds[0].data.fields[0].name).toContain('Fri');
      expect(replyArg.embeds[0].data.fields[0].name).toContain('20:00');
      expect(replyArg.embeds[0].data.fields[0].value).toContain(
        'America/Denver',
      );
    });

    it('replies with no-sessions message when team has no active sessions', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-list',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No active sessions for this team.',
      );
    });

    it('rejects when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-list',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
    });

    it('rejects when coordinator is not the team leader', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        ...team,
        leaderUserId: 'someone-else-id',
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-list',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'You are not the leader of the <@&member-role-id> team.',
      );
      expect(sessionCollection.getActiveForTeams).not.toHaveBeenCalled();
    });
  });

  describe('schedule-remove subcommand', () => {
    const now = Timestamp.now();
    const team = {
      guildId: 'guild-id',
      teamId: 'member-role-id',
      active: true,
      memberRoleId: 'member-role-id',
      leaderUserId: 'coordinator-id',
      createdAt: now,
      updatedAt: now,
    };
    const session = {
      guildId: 'guild-id',
      sessionId: 's1',
      teamId: 'member-role-id',
      active: true,
      dayOfWeek: 5 as const,
      startTime: '20:00',
      durationMinutes: 120,
      timezone: 'America/Denver',
      createdAt: now,
      updatedAt: now,
    };

    it('shows a select menu with active sessions', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-remove',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const firstCall = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(firstCall).toMatchObject({ components: expect.any(Array) });
    });

    it('archives the selected session and replies with success', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-remove',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(sessionCollection.archive).toHaveBeenCalledWith('guild-id', 's1');
      expect(interaction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('removed'),
          components: [],
        }),
      );
    });

    it('replies with timeout when selection times out', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const replyMessage = {
        awaitMessageComponent: vi.fn().mockRejectedValue({
          code: DiscordjsErrorCodes.InteractionCollectorError,
        }),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-remove',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenLastCalledWith({
        content: 'Selection timed out.',
        components: [],
      });
      expect(sessionCollection.archive).not.toHaveBeenCalled();
    });

    it('replies with no-sessions message when team has no active sessions', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-remove',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No active sessions for this team.',
      );
    });

    it('rejects when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-remove',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
    });

    it('rejects when coordinator is not the team leader', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        ...team,
        leaderUserId: 'someone-else-id',
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-remove',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'You are not the leader of the <@&member-role-id> team.',
      );
      expect(sessionCollection.getActiveForTeams).not.toHaveBeenCalled();
    });
  });

  describe('schedule-edit subcommand', () => {
    const now = Timestamp.now();
    const team = {
      guildId: 'guild-id',
      teamId: 'member-role-id',
      active: true,
      memberRoleId: 'member-role-id',
      leaderUserId: 'coordinator-id',
      createdAt: now,
      updatedAt: now,
    };
    const session = {
      guildId: 'guild-id',
      sessionId: 's1',
      teamId: 'member-role-id',
      active: true,
      dayOfWeek: 5 as const,
      startTime: '20:00',
      durationMinutes: 120,
      timezone: 'America/Denver',
      createdAt: now,
      updatedAt: now,
    };

    it('shows a select menu with active sessions', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: () => null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const firstCall = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(firstCall).toMatchObject({ components: expect.any(Array) });
    });

    it('upserts the session with provided field values', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: (name: string) => {
            if (name === 'day-of-week') return 6;
            if (name === 'duration-minutes') return 90;
            return null;
          },
          getString: (name: string) => {
            if (name === 'start-time') return '21:00';
            if (name === 'timezone') return 'UTC';
            return null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(sessionCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 's1',
          dayOfWeek: 6,
          startTime: '21:00',
          durationMinutes: 90,
          timezone: 'UTC',
        }),
      );
      expect(interaction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: 'Session updated.',
          components: [],
        }),
      );
    });

    it('keeps existing field values when options are not provided', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const componentInteraction = { values: ['s1'], deferUpdate: vi.fn() };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: () => null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(sessionCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 's1',
          dayOfWeek: 5,
          startTime: '20:00',
          durationMinutes: 120,
          timezone: 'America/Denver',
        }),
      );
    });

    it('rejects with invalid-time error before any Firestore reads', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: () => null,
          getString: (name: string) =>
            name === 'start-time' ? 'not-a-time' : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'Invalid start time. Use HH:mm format (e.g. 20:00).',
      );
      expect(helperTeamCollection.getByMemberRole).not.toHaveBeenCalled();
      expect(sessionCollection.upsert).not.toHaveBeenCalled();
    });

    it('replies with timeout when selection times out', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([session]);

      const replyMessage = {
        awaitMessageComponent: vi.fn().mockRejectedValue({
          code: DiscordjsErrorCodes.InteractionCollectorError,
        }),
      };
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: () => null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenLastCalledWith({
        content: 'Selection timed out.',
        components: [],
      });
      expect(sessionCollection.upsert).not.toHaveBeenCalled();
    });

    it('replies with no-sessions message when team has no active sessions', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(team);
      sessionCollection.getActiveForTeams.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: () => null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No active sessions for this team.',
      );
    });

    it('rejects when no team is configured for the role', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce(undefined);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'role-id' } : null,
          getInteger: () => null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No team is configured for the role <@&role-id>.',
      );
    });

    it('rejects when coordinator is not the team leader', async () => {
      helperTeamCollection.getByMemberRole.mockResolvedValueOnce({
        ...team,
        leaderUserId: 'someone-else-id',
      });

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: {
          getSubcommand: () => 'schedule-edit',
          getRole: (name: string) =>
            name === 'member-role' ? { id: 'member-role-id' } : null,
          getInteger: () => null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'You are not the leader of the <@&member-role-id> team.',
      );
      expect(sessionCollection.getActiveForTeams).not.toHaveBeenCalled();
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
