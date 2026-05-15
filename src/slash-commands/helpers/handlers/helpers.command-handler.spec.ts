import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { HelperAbsenceCollection } from '../../../firebase/collections/helper-absence.collection.js';
import { HelperTeamSessionCollection } from '../../../firebase/collections/helper-team-session.collection.js';
import { HelperTeamAuthorizationService } from '../../../helper-team/helper-team-authorization.service.js';
import { HelperTeamMembershipService } from '../../../helper-team/helper-team-membership.service.js';
import { HelperTeamNotificationService } from '../../../helper-team/helper-team-notification.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { HelpersCommandHandler } from './helpers.command-handler.js';

describe('HelpersCommandHandler', () => {
  let handler: HelpersCommandHandler;
  let membershipService: Mocked<HelperTeamMembershipService>;
  let absenceCollection: Mocked<HelperAbsenceCollection>;
  let sessionCollection: Mocked<HelperTeamSessionCollection>;
  let authorizationService: Mocked<HelperTeamAuthorizationService>;
  let notificationService: Mocked<HelperTeamNotificationService>;

  const now = Timestamp.now();

  const membership = {
    teamId: 'alpha',
    teamName: 'Alpha',
    memberRoleId: 'member-role',
    leaderUserId: 'leader-user-id',
    role: 'member' as const,
  };

  const activeSession = {
    guildId: 'guild-id',
    sessionId: 's1',
    teamId: 'alpha',
    active: true,
    dayOfWeek: 5 as const,
    startTime: '20:00',
    durationMinutes: 120,
    timezone: 'America/Denver',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [HelpersCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(HelpersCommandHandler);
    membershipService = fixture.get(HelperTeamMembershipService);
    absenceCollection = fixture.get(HelperAbsenceCollection);
    sessionCollection = fixture.get(HelperTeamSessionCollection);
    authorizationService = fixture.get(HelperTeamAuthorizationService);
    notificationService = fixture.get(HelperTeamNotificationService);
    authorizationService.canUseHelperSelfService.mockResolvedValue(true);
    authorizationService.isCoordinator.mockResolvedValue(true);
    notificationService.sendSessionAbsenceNotification.mockResolvedValue({
      sent: true,
    });

    // Default: user has one membership and one active session
    membershipService.getMembershipsForUser.mockResolvedValue([membership]);
    sessionCollection.getActiveForTeams.mockResolvedValue([activeSession]);
  });

  describe('absent-session subcommand', () => {
    it('replies with a select menu when sessions are available', async () => {
      const occurrenceUnixSeconds = Math.floor(Date.now() / 1000) + 7200;
      const componentInteraction = {
        values: [`alpha|s1|${occurrenceUnixSeconds}`],
        deferUpdate: vi.fn(),
      };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };

      sessionCollection.get.mockResolvedValueOnce(activeSession);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: {
          getSubcommand: () => 'absent-session',
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      // First editReply call should render the select menu
      const firstCall = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(firstCall).toMatchObject({ components: expect.any(Array) });
    });

    it('replies with no-sessions message when user has no team memberships', async () => {
      membershipService.getMembershipsForUser.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: { getSubcommand: () => 'absent-session' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'No upcoming team sessions found.',
      );
    });

    it('creates a session absence when the user selects a session', async () => {
      const occurrenceUnixSeconds = Math.floor(Date.now() / 1000) + 7200;

      const componentInteraction = {
        values: [`alpha|s1|${occurrenceUnixSeconds}`],
        deferUpdate: vi.fn(),
      };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };

      sessionCollection.get.mockResolvedValueOnce(activeSession);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: {
          getSubcommand: () => 'absent-session',
          getString: (name: string) => (name === 'reason' ? 'Sick day' : null),
        },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(absenceCollection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'session',
          guildId: 'guild-id',
          teamId: 'alpha',
          sessionId: 's1',
          discordId: 'helper-id',
          reason: 'Sick day',
        }),
      );
      expect(interaction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('recorded'),
        }),
      );
    });

    it('replies with timeout message when selection times out', async () => {
      const { DiscordjsErrorCodes } = await import('discord.js');
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockRejectedValue({
          code: DiscordjsErrorCodes.InteractionCollectorError,
        }),
      };

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: {
          getSubcommand: () => 'absent-session',
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
      expect(absenceCollection.create).not.toHaveBeenCalled();
    });
  });

  describe('absent-range subcommand', () => {
    it('creates a range absence document', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: {
          getSubcommand: () => 'absent-range',
          getString: (name: string) => {
            const values: Record<string, string> = {
              'start-date': '2026-05-20',
              'end-date': '2026-05-27',
              timezone: 'America/Denver',
              reason: 'Vacation',
            };
            return values[name] ?? null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(absenceCollection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'range',
          startDate: '2026-05-20',
          endDate: '2026-05-27',
          discordId: 'helper-id',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('absence'),
      );
    });

    it('computes expiresAt based on UTC end date, not server local time', async () => {
      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: {
          getSubcommand: () => 'absent-range',
          getString: (name: string) => {
            const values: Record<string, string> = {
              'start-date': '2026-05-20',
              'end-date': '2026-05-27',
              timezone: 'America/Denver',
            };
            return values[name] ?? null;
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      const call = (absenceCollection.create as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      // expiresAt = 7 days after start of 2026-05-28T00:00:00Z = 2026-06-04T00:00:00Z
      const expectedExpiresAt = new Date('2026-06-04T00:00:00.000Z');
      expect(call.expiresAt.toDate().toISOString()).toBe(
        expectedExpiresAt.toISOString(),
      );
    });
  });

  describe('absent-remove subcommand', () => {
    const futureAbsence = {
      absenceId: 'abs-1',
      type: 'range' as const,
      guildId: 'guild-id',
      discordId: 'helper-id',
      startDate: '2026-05-20',
      endDate: '2026-05-27',
      timezone: 'America/Denver',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 86_400_000)),
    };

    it('removes the selected absence and replies with success', async () => {
      absenceCollection.getFutureForUser.mockResolvedValueOnce([futureAbsence]);

      const componentInteraction = {
        values: ['abs-1'],
        deferUpdate: vi.fn(),
      };
      const replyMessage = {
        awaitMessageComponent: vi.fn().mockResolvedValue(componentInteraction),
      };

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: { getSubcommand: () => 'absent-remove' },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(absenceCollection.remove).toHaveBeenCalledWith(
        'guild-id',
        'abs-1',
      );
      expect(
        notificationService.sendAbsenceRemovedNotification,
      ).toHaveBeenCalledWith({
        guildId: 'guild-id',
        helperUserId: 'helper-id',
        description: 'Range: 2026-05-20 to 2026-05-27',
      });
      expect(interaction.editReply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('removed'),
        }),
      );
    });

    it('replies with timeout message when selection times out', async () => {
      const { DiscordjsErrorCodes } = await import('discord.js');
      absenceCollection.getFutureForUser.mockResolvedValueOnce([futureAbsence]);

      const replyMessage = {
        awaitMessageComponent: vi.fn().mockRejectedValue({
          code: DiscordjsErrorCodes.InteractionCollectorError,
        }),
      };

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: { getSubcommand: () => 'absent-remove' },
        deferReply: vi.fn(),
        editReply: vi.fn().mockResolvedValue(replyMessage),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenLastCalledWith({
        content: 'Selection timed out.',
        components: [],
      });
      expect(absenceCollection.remove).not.toHaveBeenCalled();
    });

    it('replies with no-absences message when user has no upcoming absences', async () => {
      absenceCollection.getFutureForUser.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'helper-id' },
        options: { getSubcommand: () => 'absent-remove' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        'You have no upcoming absences to remove.',
      );
      expect(absenceCollection.remove).not.toHaveBeenCalled();
    });
  });

  describe('status subcommand', () => {
    it('shows all guild absences grouped by user', async () => {
      const absenceNow = Timestamp.now();
      absenceCollection.getActiveForGuild.mockResolvedValueOnce([
        {
          absenceId: 'a1',
          type: 'session' as const,
          guildId: 'guild-id',
          discordId: 'helper-1',
          teamId: 'alpha',
          sessionId: 's1',
          occurrenceStart: absenceNow,
          occurrenceEnd: absenceNow,
          createdAt: absenceNow,
          updatedAt: absenceNow,
          expiresAt: absenceNow,
        },
        {
          absenceId: 'a2',
          type: 'range' as const,
          guildId: 'guild-id',
          discordId: 'helper-2',
          startDate: '2026-05-20',
          endDate: '2026-05-27',
          timezone: 'America/Denver',
          createdAt: absenceNow,
          updatedAt: absenceNow,
          expiresAt: absenceNow,
        },
      ]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: { getSubcommand: () => 'status' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(absenceCollection.getActiveForGuild).toHaveBeenCalledWith(
        'guild-id',
        expect.any(Date),
      );
      const call = (interaction.editReply as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(call.embeds).toHaveLength(1);
      const fields = call.embeds[0].data.fields as Array<{
        name: string;
        value: string;
      }>;
      expect(fields).toHaveLength(2);
      expect(fields[0].name).toBe('<@helper-1>');
      expect(fields[1].name).toBe('<@helper-2>');
    });

    it('shows no-absences embed when guild has no upcoming absences', async () => {
      absenceCollection.getActiveForGuild.mockResolvedValueOnce([]);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'coordinator-id' },
        options: { getSubcommand: () => 'status' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });

  describe('permission check', () => {
    it('replies with permission denied when user cannot use helper self-service', async () => {
      authorizationService.canUseHelperSelfService.mockResolvedValueOnce(false);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'user-id' },
        options: { getSubcommand: () => 'absent-session' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'You do not have permission to use this command.',
      });
    });

    it('replies with permission denied on status when user is not a coordinator', async () => {
      authorizationService.isCoordinator.mockResolvedValueOnce(false);

      const interaction = {
        guildId: 'guild-id',
        user: { id: 'user-id' },
        options: { getSubcommand: () => 'status' },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>;

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'You do not have permission to use this command.',
      });
    });
  });
});
