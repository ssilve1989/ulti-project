import { Test, TestingModule } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import { SignupStatus } from '@ulti-project/shared';
import type { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
  withInternals,
} from '../../test-utils/mock-factory.js';
import { ApprovalDecisionRequestService } from './approval-decision-request.service.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';

// TODO: Actually assert approval/decline functionality, not just that they were called
describe('SignupService', () => {
  let service: SignupService;
  let fixture: TestingModule;
  let messageReaction: MessageReaction;
  let user: User;
  let settings: SettingsDocument;
  let signup: SignupDocument;
  let repository: Mocked<SignupCollection>;
  let discordService: Mocked<DiscordService>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    fixture = await Test.createTestingModule({
      providers: [SignupService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(SignupService);
    repository = fixture.get(SignupCollection);
    discordService = fixture.get(DiscordService);
    errorService = fixture.get(ErrorService);

    messageReaction = mockOf<MessageReaction>({
      message: mockOf<Message<boolean>>({
        id: 'messageId',
        edit: vi.fn().mockResolvedValue(undefined),
        inGuild: vi.fn().mockReturnValue(true),
        embeds: [{}],
      }),
      emoji: mockOf<ReactionEmoji>({
        name: 'emojiName',
      }),
    });

    user = mockOf<User>({
      id: 'userId',
      displayAvatarURL: () => 'http://someurl.com',
      toString: () => '<@someuser>',
    });
    settings = partialMock<SettingsDocument>({});
    signup = partialMock<SignupDocument>({
      reviewMessageId: 'messageId',
      reviewedBy: undefined,
      discordId: 'abc123',
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add more tests here
  it('should handle approved reaction', async () => {
    repository.findByReviewId.mockResolvedValue(signup);

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const spy = vi
      .spyOn(
        withInternals<{
          handleApprovedReaction: (...args: unknown[]) => Promise<unknown>;
          handleDeclinedReaction: (...args: unknown[]) => Promise<unknown>;
        }>(service),
        'handleApprovedReaction',
      )
      .mockResolvedValue({});

    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).toHaveBeenCalledWith(
      signup,
      messageReaction.message,
      user,
      settings,
    );
  });

  it('should handle a declined reaction', async () => {
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.DECLINED;

    repository.findByReviewId.mockResolvedValueOnce(signup);
    discordService.getDisplayName.mockResolvedValueOnce('someuser');
    repository.updateSignupStatus.mockResolvedValueOnce(true);
    vi.spyOn(messageReaction.message, 'edit').mockResolvedValueOnce(
      mockOf<Awaited<ReturnType<(typeof messageReaction.message)['edit']>>>({}),
    );

    const handleDeclineSpy = vi.spyOn(
      withInternals<{
        handleApprovedReaction: (...args: unknown[]) => Promise<unknown>;
        handleDeclinedReaction: (...args: unknown[]) => Promise<unknown>;
      }>(service),
      'handleDeclinedReaction',
    );

    await service['handleReaction'](messageReaction, user, settings);

    expect(handleDeclineSpy).toHaveBeenCalledWith(
      signup,
      messageReaction.message,
      user,
    );
  });

  it('should return early if a signup has been reviewed', async () => {
    repository.findByReviewId.mockResolvedValue({
      ...signup,
      reviewedBy: user.id,
    });

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const spy = vi.spyOn(
      withInternals<{
        handleApprovedReaction: (...args: unknown[]) => Promise<unknown>;
        handleDeclinedReaction: (...args: unknown[]) => Promise<unknown>;
      }>(service),
      'handleApprovedReaction',
    );
    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).not.toHaveBeenCalled();
  });

  it('threads the collected comment onto SignupApprovedEvent without persisting it', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'approved',
      progPoint: 'point-a',
      comment: 'Nice work!',
    });
    repository.updateSignupStatus.mockResolvedValue(true);

    const event = await service['handleApprovedReaction'](
      signup,
      messageReaction.message,
      user,
      settings,
    );

    if (!event) {
      throw new Error('expected an event for a decided approval');
    }

    expect(event.comment).toBe('Nice work!');
    expect(event.signup).not.toHaveProperty('comment');
    expect(repository.updateSignupStatus).toHaveBeenCalledWith(
      SignupStatus.APPROVED,
      expect.not.objectContaining({ comment: expect.anything() }),
      user.username,
      'messageId',
    );
  });

  it('reverts the reaction and persists nothing when the reviewer cancels the approval', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'cancelled',
    });

    const approvedRemove = vi.fn().mockResolvedValue(undefined);
    const message = mockOf<Message<true>>({
      inGuild: () => true,
      embeds: [{}],
      reactions: {
        cache: {
          get: (key: string) =>
            key === SIGNUP_REVIEW_REACTIONS.APPROVED
              ? { users: { remove: approvedRemove } }
              : undefined,
        },
      },
    });

    const event = await service['handleApprovedReaction'](
      signup,
      message,
      user,
      settings,
    );

    expect(event).toBeUndefined();
    expect(approvedRemove).toHaveBeenCalledWith(user.id);
    expect(repository.updateSignupStatus).not.toHaveBeenCalled();
    expect(errorService.captureError).not.toHaveBeenCalled();
    expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('reports but does not DM when reverting the reaction fails after a cancelled approval', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'cancelled',
    });

    const revertError = new Error('Missing Permissions');
    const message = mockOf<Message<true>>({
      inGuild: () => true,
      embeds: [{}],
      reactions: {
        cache: {
          get: (key: string) =>
            key === SIGNUP_REVIEW_REACTIONS.APPROVED
              ? { users: { remove: vi.fn().mockRejectedValue(revertError) } }
              : undefined,
        },
      },
    });

    const event = await service['handleApprovedReaction'](
      signup,
      message,
      user,
      settings,
    );

    expect(event).toBeUndefined();
    expect(errorService.captureError).toHaveBeenCalledWith(revertError);
    expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('reverts the reaction, DMs the reviewer, and skips the sheets write when the signup changed state during approval', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'approved',
      progPoint: 'point-a',
    });
    repository.updateSignupStatus.mockResolvedValue(false);

    const approvedRemove = vi.fn().mockResolvedValue(undefined);
    const declinedRemove = vi.fn().mockResolvedValue(undefined);
    const message = mockOf<Message<true>>({
      id: 'messageId',
      inGuild: () => true,
      embeds: [{}],
      reactions: {
        cache: {
          get: (key: string) =>
            key === SIGNUP_REVIEW_REACTIONS.APPROVED
              ? { users: { remove: approvedRemove } }
              : { users: { remove: declinedRemove } },
        },
      },
    });

    const sheetsService = fixture.get(SheetsService);
    const staleSettings = partialMock<SettingsDocument>({
      spreadsheetId: 'sheet-1',
    });

    const event = await service['handleApprovedReaction'](
      signup,
      message,
      user,
      staleSettings,
    );

    expect(event).toBeUndefined();
    expect(repository.updateSignupStatus).toHaveBeenCalledWith(
      SignupStatus.APPROVED,
      expect.objectContaining({ progPoint: 'point-a' }),
      user.username,
      'messageId',
    );
    expect(sheetsService.upsertSignup).not.toHaveBeenCalled();
    expect(approvedRemove).toHaveBeenCalledWith(user.id);
    expect(declinedRemove).toHaveBeenCalledWith(user.id);
    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        content: expect.stringContaining(SIGNUP_MESSAGES.SIGNUP_STATE_CHANGED),
      }),
    );
  });

  describe('handleError', () => {
    const buildMessageWithReactions = (
      approvedRemove: ReturnType<typeof vi.fn>,
      declinedRemove: ReturnType<typeof vi.fn>,
    ) =>
      mockOf<Message<boolean>>({
        reactions: {
          cache: {
            get: (key: string) => {
              if (key === SIGNUP_REVIEW_REACTIONS.APPROVED) {
                return { users: { remove: approvedRemove } };
              }
              if (key === SIGNUP_REVIEW_REACTIONS.DECLINED) {
                return { users: { remove: declinedRemove } };
              }
              return undefined;
            },
          },
        },
      });

    it('reverts both reactions, DMs the reviewer, and captures the error', async () => {
      const approvedRemove = vi.fn().mockResolvedValue(undefined);
      const declinedRemove = vi.fn().mockResolvedValue(undefined);
      const message = buildMessageWithReactions(approvedRemove, declinedRemove);
      const error = new Error('boom');

      await service['handleError'](error, user, message);

      expect(approvedRemove).toHaveBeenCalledWith(user.id);
      expect(declinedRemove).toHaveBeenCalledWith(user.id);
      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
      );
      expect(errorService.captureError).toHaveBeenCalledWith(error);
    });
  });
});
