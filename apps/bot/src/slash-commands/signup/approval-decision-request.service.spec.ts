import { Test, TestingModule } from '@nestjs/testing';
import { Encounter, type SignupDocument } from '@ulti-project/shared';
import type {
  ActionRowBuilder,
  ButtonInteraction,
  Embed,
  Message,
  ModalMessageModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { PROG_POINT_SELECT_ID } from '../../encounters/encounters.components.js';
import { EncountersComponentsService } from '../../encounters/encounters-components.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import {
  APPROVE_BUTTON_ID,
  APPROVE_WITH_COMMENT_BUTTON_ID,
} from './approval-decision.components.js';
import { ApprovalDecisionRequestService } from './approval-decision-request.service.js';
import { SIGNUP_MESSAGES } from './signup.consts.js';

describe('ApprovalDecisionRequestService', () => {
  let service: ApprovalDecisionRequestService;
  let reviewer: User;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [ApprovalDecisionRequestService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(ApprovalDecisionRequestService);
    reviewer = mockOf<User>({ id: 'reviewerId' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('collectDecision', () => {
    const buildSelectInteraction = (progPoint: string) =>
      mockOf<StringSelectMenuInteraction>({
        customId: PROG_POINT_SELECT_ID,
        values: [progPoint],
        isStringSelectMenu: () => true,
        isButton: () => false,
        update: vi.fn().mockResolvedValue(undefined),
      });

    const buildApproveInteraction = () =>
      mockOf<ButtonInteraction>({
        customId: APPROVE_BUTTON_ID,
        isStringSelectMenu: () => false,
        isButton: () => true,
        update: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
      });

    const buildApproveWithCommentInteraction = (
      awaitModalSubmit: ReturnType<typeof vi.fn>,
    ) =>
      mockOf<ButtonInteraction>({
        customId: APPROVE_WITH_COMMENT_BUTTON_ID,
        user: reviewer,
        isStringSelectMenu: () => false,
        isButton: () => true,
        update: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        showModal: vi.fn().mockResolvedValue(undefined),
        awaitModalSubmit,
      });

    const buildModalSubmit = (comment: string) =>
      mockOf<ModalMessageModalSubmitInteraction>({
        fields: { getTextInputValue: vi.fn().mockReturnValue(comment) },
        isFromMessage: () => true,
        update: vi.fn().mockResolvedValue(undefined),
      });

    it('resolves with just the prog point when Approve is pressed', async () => {
      const selectInteraction = buildSelectInteraction('point-a');
      const approveInteraction = buildApproveInteraction();
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValueOnce(selectInteraction)
        .mockResolvedValueOnce(approveInteraction);
      const message = mockOf<Message>({ awaitMessageComponent });

      const result = await service['collectDecision'](
        message,
        reviewer,
        mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
      );

      expect(result).toEqual({ progPoint: 'point-a' });
      expect(selectInteraction.update).toHaveBeenCalled();
      expect(approveInteraction.update).toHaveBeenCalledWith({
        components: [],
      });
    });

    it('resolves with a trimmed comment when Approve with Comment is submitted', async () => {
      const selectInteraction = buildSelectInteraction('point-a');
      const modalSubmit = buildModalSubmit('  Great job!  ');
      const approveWithCommentInteraction = buildApproveWithCommentInteraction(
        vi.fn().mockResolvedValue(modalSubmit),
      );
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValueOnce(selectInteraction)
        .mockResolvedValueOnce(approveWithCommentInteraction);
      const message = mockOf<Message>({ awaitMessageComponent });

      const result = await service['collectDecision'](
        message,
        reviewer,
        mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
      );

      expect(result).toEqual({ progPoint: 'point-a', comment: 'Great job!' });
      expect(approveWithCommentInteraction.showModal).toHaveBeenCalled();
      expect(modalSubmit.update).toHaveBeenCalledWith({ components: [] });
    });

    it('treats a blank submitted comment as no comment', async () => {
      const selectInteraction = buildSelectInteraction('point-a');
      const modalSubmit = buildModalSubmit('   ');
      const approveWithCommentInteraction = buildApproveWithCommentInteraction(
        vi.fn().mockResolvedValue(modalSubmit),
      );
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValueOnce(selectInteraction)
        .mockResolvedValueOnce(approveWithCommentInteraction);
      const message = mockOf<Message>({ awaitMessageComponent });

      const result = await service['collectDecision'](
        message,
        reviewer,
        mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
      );

      expect(result).toEqual({ progPoint: 'point-a', comment: undefined });
    });

    it('replies ephemeral and keeps collecting when a button is pressed before a prog point is selected', async () => {
      const earlyApprove = buildApproveInteraction();
      const selectInteraction = buildSelectInteraction('point-a');
      const approveInteraction = buildApproveInteraction();
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValueOnce(earlyApprove)
        .mockResolvedValueOnce(selectInteraction)
        .mockResolvedValueOnce(approveInteraction);
      const message = mockOf<Message>({ awaitMessageComponent });

      const result = await service['collectDecision'](
        message,
        reviewer,
        mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
      );

      expect(earlyApprove.reply).toHaveBeenCalledWith({
        content: SIGNUP_MESSAGES.PROG_POINT_REQUIRED_BEFORE_DECISION,
        flags: MessageFlags.Ephemeral,
      });
      expect(awaitMessageComponent).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ progPoint: 'point-a' });
    });

    it('propagates a timeout with nothing captured', async () => {
      const timeoutError = new Error('collector timed out');
      const awaitMessageComponent = vi.fn().mockRejectedValue(timeoutError);
      const message = mockOf<Message>({ awaitMessageComponent });

      await expect(
        service['collectDecision'](
          message,
          reviewer,
          mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
        ),
      ).rejects.toThrow('collector timed out');
    });

    it('propagates a timeout after a prog point was selected but before a button was pressed', async () => {
      const selectInteraction = buildSelectInteraction('point-a');
      const timeoutError = new Error('collector timed out');
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValueOnce(selectInteraction)
        .mockRejectedValueOnce(timeoutError);
      const message = mockOf<Message>({ awaitMessageComponent });

      await expect(
        service['collectDecision'](
          message,
          reviewer,
          mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
        ),
      ).rejects.toThrow('collector timed out');
    });

    it('propagates a timeout while waiting on the comment modal', async () => {
      const selectInteraction = buildSelectInteraction('point-a');
      const timeoutError = new Error('modal timed out');
      const approveWithCommentInteraction = buildApproveWithCommentInteraction(
        vi.fn().mockRejectedValue(timeoutError),
      );
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValueOnce(selectInteraction)
        .mockResolvedValueOnce(approveWithCommentInteraction);
      const message = mockOf<Message>({ awaitMessageComponent });

      await expect(
        service['collectDecision'](
          message,
          reviewer,
          mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({}),
        ),
      ).rejects.toThrow('modal timed out');
    });
  });

  describe('remainingTime', () => {
    it('never returns a falsy value, even when the deadline has already passed', () => {
      // discord.js's Collector only arms its timeout timer `if (options.time)`,
      // and 0 is falsy — so a deadline already at/past now must still floor
      // to a truthy value (1), not 0, or the collector would wait forever
      // instead of timing out immediately.
      const pastDeadline = Date.now() - 1000;

      const result = service['remainingTime'](pastDeadline);

      expect(result).toBe(1);
    });

    it('returns the real remaining time when the deadline is in the future', () => {
      const futureDeadline = Date.now() + 60_000;

      const result = service['remainingTime'](futureDeadline);

      expect(result).toBeGreaterThan(1);
      expect(result).toBeLessThanOrEqual(60_000);
    });
  });

  describe('requestApprovalDecision', () => {
    it('sends the DM with a disabled button row and cleans up components afterward', async () => {
      const fixture: TestingModule = await Test.createTestingModule({
        providers: [ApprovalDecisionRequestService],
      })
        .useMocker(createAutoMock)
        .compile();
      const requestService = fixture.get(ApprovalDecisionRequestService);
      const discordService: Mocked<DiscordService> =
        fixture.get(DiscordService);
      const encountersComponentsService: Mocked<EncountersComponentsService> =
        fixture.get(EncountersComponentsService);

      encountersComponentsService.createProgPointSelectMenu.mockResolvedValue(
        mockOf<StringSelectMenuBuilder>({}),
      );

      const edit = vi.fn().mockResolvedValue(undefined);
      const message = mockOf<Message<false>>({
        awaitMessageComponent: vi
          .fn()
          .mockRejectedValue(new Error('collector timed out')),
        edit,
      });
      discordService.sendDirectMessage.mockResolvedValue(message);

      const signup = partialMock<SignupDocument>({ encounter: Encounter.DSR });
      const sourceEmbed = mockOf<Embed>({});

      await expect(
        requestService.requestApprovalDecision(signup, sourceEmbed, reviewer),
      ).rejects.toThrow('collector timed out');

      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        reviewer.id,
        expect.objectContaining({ components: expect.any(Array) }),
      );
      expect(edit).toHaveBeenCalledWith({ components: [] });
    });
  });
});
