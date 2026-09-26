import { Test, TestingModule } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import { ApprovalDecisionRequestService } from './approval-decision-request.service.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';

describe('SignupService', () => {
  let service: SignupService;
  let fixture: TestingModule;
  let user: User;
  let settings: SettingsDocument;
  let signup: SignupDocument;
  let discordService: Mocked<DiscordService>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    fixture = await Test.createTestingModule({
      providers: [SignupService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(SignupService);
    discordService = fixture.get(DiscordService);
    errorService = fixture.get(ErrorService);

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

  it('reports but does not DM when reverting the reaction fails after a cancelled approval', async () => {
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

    it('reports each rejected step and resolves without throwing when the DM send fails', async () => {
      const approvedRemove = vi.fn().mockResolvedValue(undefined);
      const declinedRemove = vi.fn().mockResolvedValue(undefined);
      const message = buildMessageWithReactions(approvedRemove, declinedRemove);
      const error = new Error('boom');
      const dmError = new Error('DMs closed');
      discordService.sendDirectMessage.mockRejectedValueOnce(dmError);

      await expect(
        service['handleError'](error, user, message),
      ).resolves.toBeUndefined();

      expect(errorService.captureError).toHaveBeenCalledWith(error);
      expect(errorService.captureError).toHaveBeenCalledWith(dmError);
    });
  });

  describe('processEvent', () => {
    it('resolves and reports a rejected DM without crashing when the error path fails to notify the reviewer', async () => {
      const settingsCollection: Mocked<SettingsCollection> =
        fixture.get(SettingsCollection);
      const dmError = new Error('DMs closed');
      discordService.sendDirectMessage.mockRejectedValueOnce(dmError);

      settingsCollection.getSettings.mockResolvedValueOnce(
        partialMock<SettingsDocument>({ reviewChannel: 'channelId' }),
      );

      const approvedRemove = vi.fn().mockResolvedValue(undefined);
      const declinedRemove = vi.fn().mockResolvedValue(undefined);
      const message = mockOf<Message<true>>({
        id: 'messageId',
        guildId: 'guildId',
        channelId: 'channelId',
        inGuild: () => true,
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

      const reviewer = mockOf<User>({
        id: 'reviewerId',
        username: 'reviewer',
        partial: false,
      });

      const reaction = mockOf<MessageReaction>({
        message,
        partial: false,
        emoji: mockOf<ReactionEmoji>({ name: 'emojiName' }),
      });

      await expect(
        service.processEvent({ reaction, user: reviewer }),
      ).resolves.toBeUndefined();

      await vi.waitFor(() => {
        expect(errorService.captureError).toHaveBeenCalledWith(dmError);
      });
    });
  });
});
