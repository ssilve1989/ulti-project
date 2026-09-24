import { Test, TestingModule } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import { SignupStatus } from '@ulti-project/shared';
import type {
  Message,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { DiscordAPIError } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
  withInternals,
} from '../../test-utils/mock-factory.js';
import { DECLINE_REASON_SELECT_ID } from './decline-reason.components.js';
import {
  DeclineReasonRequestService,
  MAX_MODAL_SHOW_ATTEMPTS,
} from './decline-reason-request.service.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

const unknownInteractionError = () =>
  new DiscordAPIError(
    { message: 'Unknown interaction', code: 10062 },
    10062,
    404,
    'POST',
    '/interactions/123/abc/callback',
    { body: undefined, files: undefined },
  );

describe('DeclineReasonRequestService', () => {
  let service: DeclineReasonRequestService;
  let signup: SignupDocument;
  let reviewer: User;
  let reviewMessage: Message<true>;
  let signupId: string;
  let repository: Mocked<SignupCollection>;
  let discordService: Mocked<DiscordService>;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [DeclineReasonRequestService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(DeclineReasonRequestService);
    repository = fixture.get(SignupCollection);
    discordService = fixture.get(DiscordService);

    signup = partialMock<SignupDocument>({
      discordId: 'abc123',
      encounter: 'DSR',
      reviewMessageId: 'messageId',
      status: SignupStatus.DECLINED,
      username: 'signupUser',
    });
    reviewer = mockOf<User>({ id: 'reviewerId', username: 'reviewerName' });
    reviewMessage = mockOf<Message<true>>({});
    signupId = `${signup.discordId}-${signup.encounter}`;
  });

  describe('requestDeclineReason', () => {
    it('resolves without an unhandled rejection and reports a non-timeout error from the reaction collector', async () => {
      const collectorError = new Error('boom - not a timeout');
      const dmMessage = mockOf<Message<false>>({
        awaitMessageComponent: vi.fn().mockRejectedValue(collectorError),
      });
      discordService.sendDirectMessage.mockResolvedValueOnce(dmMessage);

      const reportErrorSpy = vi.spyOn(
        withInternals<{ reportError: (...args: unknown[]) => void }>(service),
        'reportError',
      );

      const unhandledRejections: unknown[] = [];
      const onUnhandledRejection = (reason: unknown) => {
        unhandledRejections.push(reason);
      };
      process.on('unhandledRejection', onUnhandledRejection);

      try {
        await expect(
          service.requestDeclineReason(signup, reviewer, reviewMessage),
        ).resolves.toBeUndefined();

        // Let the microtask queue drain so a floating rejection would surface.
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }

      expect(unhandledRejections).toEqual([]);
      expect(reportErrorSpy).toHaveBeenCalledWith(collectorError, {
        signup,
        reviewer,
      });
    });
  });

  describe('handleReasonSelection', () => {
    it('returns false and asks the reviewer to retry when the modal token has already expired', async () => {
      const userSend = vi.fn().mockResolvedValue(undefined);
      const interaction = mockOf<StringSelectMenuInteraction>({
        values: [CUSTOM_DECLINE_REASON_VALUE],
        showModal: vi.fn().mockRejectedValue(unknownInteractionError()),
        user: { send: userSend },
      });

      const result = await service['handleReasonSelection'](
        interaction,
        signup,
        signupId,
        reviewer,
        reviewMessage,
      );

      expect(result).toBe(false);
      expect(userSend).toHaveBeenCalledWith(
        expect.stringContaining('click the dropdown again'),
      );
    });

    it('rethrows errors from showModal that are not a 10062', async () => {
      const interaction = mockOf<StringSelectMenuInteraction>({
        values: [CUSTOM_DECLINE_REASON_VALUE],
        showModal: vi.fn().mockRejectedValue(new Error('boom')),
        user: { send: vi.fn() },
      });

      await expect(
        service['handleReasonSelection'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        ),
      ).rejects.toThrow('boom');
    });
  });

  describe('handleDeclineReasonInteractions retry loop', () => {
    const buildSelectInteraction = () =>
      mockOf<StringSelectMenuInteraction>({
        customId: `${DECLINE_REASON_SELECT_ID}-${signupId}`,
      });

    it('re-listens for a selection and retries after a recoverable modal failure', async () => {
      const selectInteraction = buildSelectInteraction();
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValue(selectInteraction);
      const dmMessage = mockOf<Message<false>>({
        awaitMessageComponent,
      });

      const handleReasonSelectionSpy = vi
        .spyOn(
          withInternals<{
            handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
            publishGuardedDeclineReasonEvent: (...args: unknown[]) => unknown;
          }>(service),
          'handleReasonSelection',
        )
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await service['handleDeclineReasonInteractions'](
        dmMessage,
        signup,
        reviewer,
        reviewMessage,
      );

      expect(awaitMessageComponent).toHaveBeenCalledTimes(2);
      expect(handleReasonSelectionSpy).toHaveBeenCalledTimes(2);
    });

    it('gives up and dispatches a no-reason decline after exhausting retry attempts', async () => {
      const selectInteraction = buildSelectInteraction();
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValue(selectInteraction);
      const dmMessage = mockOf<Message<false>>({
        awaitMessageComponent,
      });

      vi.spyOn(
        withInternals<{
          handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
          publishGuardedDeclineReasonEvent: (...args: unknown[]) => unknown;
        }>(service),
        'handleReasonSelection',
      ).mockResolvedValue(false);
      const dispatchSpy = vi
        .spyOn(
          withInternals<{
            handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
            publishGuardedDeclineReasonEvent: (...args: unknown[]) => unknown;
          }>(service),
          'publishGuardedDeclineReasonEvent',
        )
        .mockImplementation(() => undefined);

      await service['handleDeclineReasonInteractions'](
        dmMessage,
        signup,
        reviewer,
        reviewMessage,
      );

      expect(awaitMessageComponent).toHaveBeenCalledTimes(
        MAX_MODAL_SHOW_ATTEMPTS,
      );
      expect(dispatchSpy).toHaveBeenCalledWith(signup, reviewer, reviewMessage);
    });
  });

  describe('updateSignupWithDeclineReason', () => {
    it('does not record the reason and does not DM the reviewer when the signup has left the declined round', async () => {
      repository.updateDeclineReasonIfActive.mockResolvedValueOnce(false);

      const result = await service['updateSignupWithDeclineReason'](
        signup,
        'lacks proof',
        reviewer,
        reviewMessage,
      );

      expect(result).toBe(false);
      expect(repository.updateDeclineReasonIfActive).toHaveBeenCalledWith(
        { discordId: signup.discordId, encounter: signup.encounter },
        'lacks proof',
        signup.reviewMessageId,
        reviewer.username,
      );
      expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('publishGuardedDeclineReasonEvent', () => {
    it('does not publish the event and notifies the reviewer when the signup changed state', async () => {
      repository.findById.mockResolvedValue(
        partialMock<SignupDocument>({
          status: SignupStatus.UPDATE_PENDING,
          reviewMessageId: signup.reviewMessageId,
          reviewedBy: reviewer.username,
        }),
      );

      await service['publishGuardedDeclineReasonEvent'](
        signup,
        reviewer,
        reviewMessage,
        'lacks proof',
      );

      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        reviewer.id,
        expect.objectContaining({ content: expect.any(String) }),
      );
    });

    it('does not publish the event when the signup since moved to a new review round', async () => {
      repository.findById.mockResolvedValue(
        partialMock<SignupDocument>({
          status: SignupStatus.DECLINED,
          reviewMessageId: 'newMessageId',
          reviewedBy: reviewer.username,
        }),
      );

      await service['publishGuardedDeclineReasonEvent'](
        signup,
        reviewer,
        reviewMessage,
        'lacks proof',
      );

      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        reviewer.id,
        expect.objectContaining({ content: expect.any(String) }),
      );
    });

    it('does not publish the event when the signup has since been reviewed by someone else', async () => {
      repository.findById.mockResolvedValue(
        partialMock<SignupDocument>({
          status: SignupStatus.DECLINED,
          reviewMessageId: signup.reviewMessageId,
          reviewedBy: 'otherReviewer',
        }),
      );

      await service['publishGuardedDeclineReasonEvent'](
        signup,
        reviewer,
        reviewMessage,
        'lacks proof',
      );

      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        reviewer.id,
        expect.objectContaining({ content: expect.any(String) }),
      );
    });
  });

  describe('handleReasonSelection reply', () => {
    it('replies non-ephemerally and strips the select menu when the signup is stale', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const messageEdit = vi.fn().mockResolvedValue(undefined);
      const interaction = mockOf<StringSelectMenuInteraction>({
        values: ['lacks proof'],
        reply,
        message: mockOf<Message>({ edit: messageEdit }),
      });
      repository.updateDeclineReasonIfActive.mockResolvedValueOnce(false);

      await service['handleReasonSelection'](
        interaction,
        signup,
        signupId,
        reviewer,
        reviewMessage,
      );

      expect(messageEdit).toHaveBeenCalledWith({ components: [] });
      expect(reply).toHaveBeenCalledWith({
        content: expect.stringContaining('not recorded'),
      });
      expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
      expect(repository.updateDeclineReasonIfActive).toHaveBeenCalledWith(
        { discordId: signup.discordId, encounter: signup.encounter },
        'lacks proof',
        signup.reviewMessageId,
        reviewer.username,
      );
    });
  });

  describe('handleCustomReasonSubmit', () => {
    const buildModalInteraction = (message: Message | null) =>
      mockOf<ModalSubmitInteraction>({
        fields: { getTextInputValue: vi.fn().mockReturnValue('lacks proof') },
        reply: vi.fn().mockResolvedValue(undefined),
        message,
      });

    it('replies non-ephemerally and strips the select menu when the signup is stale', async () => {
      const messageEdit = vi.fn().mockResolvedValue(undefined);
      const interaction = buildModalInteraction(
        mockOf<Message>({ edit: messageEdit }),
      );
      repository.updateDeclineReasonIfActive.mockResolvedValueOnce(false);

      await service['handleCustomReasonSubmit'](
        interaction,
        signup,
        reviewer,
        reviewMessage,
      );

      expect(messageEdit).toHaveBeenCalledWith({ components: [] });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('not recorded'),
      });
      expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
    });

    it('does not throw when the modal interaction has no source message', async () => {
      const interaction = buildModalInteraction(null);
      repository.updateDeclineReasonIfActive.mockResolvedValueOnce(false);

      await service['handleCustomReasonSubmit'](
        interaction,
        signup,
        reviewer,
        reviewMessage,
      );

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('not recorded'),
      });
    });
  });
});
