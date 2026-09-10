import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type {
  ButtonInteraction,
  Message,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { DiscordAPIError, MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { MAX_MODAL_SHOW_ATTEMPTS } from '../../common/discord-interaction.guards.js';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
  withInternals,
} from '../../test-utils/mock-factory.js';
import {
  APPROVAL_COMMENT_ADD_BUTTON_ID,
  APPROVAL_COMMENT_MODAL_ID,
  APPROVAL_COMMENT_SKIP_BUTTON_ID,
} from './approval-comment.components.js';
import { DECLINE_REASON_SELECT_ID } from './decline-reason.components.js';
import { SignupApprovalCommentCollectedEvent } from './events/signup.events.js';
import { ReviewDmFlowService } from './review-dm-flow.service.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

const callOrder = (fn: (...args: never[]) => unknown): number =>
  vi.mocked(fn).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;

const unknownInteractionError = () =>
  new DiscordAPIError(
    { message: 'Unknown interaction', code: 10062 },
    10062,
    404,
    'POST',
    '/interactions/123/abc/callback',
    { body: undefined, files: undefined },
  );

const collectorTimeoutError = () =>
  Object.assign(new Error('Collector received no interactions'), {
    code: 'InteractionCollectorError',
  });

describe('ReviewDmFlowService', () => {
  let service: ReviewDmFlowService;
  let discordService: Mocked<DiscordService>;
  let signupCollection: Mocked<SignupCollection>;
  let eventBus: Mocked<EventBus>;
  let signup: SignupDocument;
  let reviewer: User;
  let reviewMessage: Message<true>;
  let signupId: string;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [ReviewDmFlowService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(ReviewDmFlowService);
    discordService = fixture.get(DiscordService);
    signupCollection = fixture.get(SignupCollection);
    eventBus = fixture.get(EventBus);

    signup = partialMock<SignupDocument>({
      discordId: 'abc123',
      encounter: 'DSR',
    });
    reviewer = mockOf<User>({ id: 'reviewerId' });
    reviewMessage = mockOf<Message<true>>({});
    signupId = `${signup.discordId}-${signup.encounter}`;

    // By default the signup is still approved when the comment lands.
    signupCollection.findById.mockResolvedValue(
      partialMock<SignupDocument>({ status: SignupStatus.APPROVED }),
    );

    // Silence the terminal-error log path while keeping it spy-able per test.
    vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  });

  // ==========================================================================
  // Approval comment flow
  // ==========================================================================

  describe('approval comment flow', () => {
    const buildModalSubmit = (modalValue: string | undefined) =>
      mockOf<ModalSubmitInteraction>({
        customId: `${APPROVAL_COMMENT_MODAL_ID}-${signupId}`,
        fields: { getTextInputValue: () => modalValue },
        reply: vi.fn().mockResolvedValue(undefined),
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      });

    const addButtonInteraction = (
      modalValue: string | undefined,
      modalSubmit: ModalSubmitInteraction = buildModalSubmit(modalValue),
    ) =>
      mockOf<ButtonInteraction>({
        customId: `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
        showModal: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        user: { send: vi.fn().mockResolvedValue(undefined) },
        awaitModalSubmit: vi.fn().mockResolvedValue(modalSubmit),
      });

    describe('handleButtonInteraction', () => {
      it('persists the comment and publishes an event when the reviewer submits text', async () => {
        const interaction = addButtonInteraction('great logs, welcome!');

        const handled = await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(handled).toBe(true);
        expect(signupCollection.updateApprovalComment).toHaveBeenCalledWith(
          { discordId: 'abc123', encounter: 'DSR' },
          'great logs, welcome!',
        );
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.any(SignupApprovalCommentCollectedEvent),
        );
      });

      it('does not persist or publish when the reviewer chooses to send without a comment', async () => {
        const interaction = mockOf<ButtonInteraction>({
          customId: `${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`,
          reply: vi.fn().mockResolvedValue(undefined),
        });

        const handled = await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(handled).toBe(true);
        expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalled();
      });

      it('does not persist or publish when the submitted comment is only whitespace', async () => {
        const interaction = addButtonInteraction('   ');

        await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
      });

      it('skips the Firestore write for a cleared signup but still publishes the event', async () => {
        const clearedSignup = partialMock<SignupDocument>({
          discordId: 'abc123',
          encounter: 'DSR',
          partyStatus: PartyStatus.Cleared,
        });
        const interaction = addButtonInteraction('gg on the clear');

        await service['handleButtonInteraction'](
          interaction,
          clearedSignup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
        // A cleared signup's document is already gone — nothing to re-fetch.
        expect(signupCollection.findById).not.toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.any(SignupApprovalCommentCollectedEvent),
        );
      });

      it('defers the reply before the Firestore write and edits it afterward', async () => {
        const modalSubmit = buildModalSubmit('great logs, welcome!');
        const interaction = addButtonInteraction(
          'great logs, welcome!',
          modalSubmit,
        );

        await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(modalSubmit.deferReply).toHaveBeenCalledWith({
          flags: MessageFlags.Ephemeral,
        });
        expect(modalSubmit.reply).not.toHaveBeenCalled();

        const deferredAt = callOrder(modalSubmit.deferReply);
        const wroteAt = callOrder(signupCollection.updateApprovalComment);
        const editedAt = callOrder(modalSubmit.editReply);
        expect(deferredAt).toBeLessThan(wroteAt);
        expect(wroteAt).toBeLessThan(editedAt);
      });

      it('still delivers the comment but warns the reviewer when the Firestore write fails', async () => {
        signupCollection.updateApprovalComment.mockRejectedValue(
          new Error('firestore down'),
        );
        const modalSubmit = buildModalSubmit('great logs, welcome!');
        const interaction = addButtonInteraction(
          'great logs, welcome!',
          modalSubmit,
        );

        const handled = await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(handled).toBe(true);
        // The comment still reaches the user via the dispatched event.
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.any(SignupApprovalCommentCollectedEvent),
        );
        expect(modalSubmit.editReply).toHaveBeenCalledWith({
          content: expect.stringMatching(/couldn't be saved|not be saved/i),
        });
      });

      it('proceeds with the comment when the approval re-check lookup fails', async () => {
        signupCollection.findById.mockRejectedValue(new Error('lookup down'));
        const modalSubmit = buildModalSubmit('great logs, welcome!');
        const interaction = addButtonInteraction(
          'great logs, welcome!',
          modalSubmit,
        );

        await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateApprovalComment).toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledWith(
          expect.any(SignupApprovalCommentCollectedEvent),
        );
      });

      it('does not claim delivery in the success reply', async () => {
        const modalSubmit = buildModalSubmit('great logs, welcome!');
        const interaction = addButtonInteraction(
          'great logs, welcome!',
          modalSubmit,
        );

        await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        const lastEdit = vi.mocked(modalSubmit.editReply).mock.lastCall?.[0];
        expect(lastEdit).toEqual({
          content: expect.stringContaining('great logs, welcome!'),
        });
        expect(lastEdit).not.toEqual({
          content: expect.stringMatching(/sent to the user/i),
        });
      });

      it('aborts and notifies the reviewer when the signup is no longer approved', async () => {
        signupCollection.findById.mockResolvedValue(
          partialMock<SignupDocument>({ status: SignupStatus.DECLINED }),
        );
        const modalSubmit = buildModalSubmit('great logs, welcome!');
        const interaction = addButtonInteraction(
          'great logs, welcome!',
          modalSubmit,
        );

        await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(modalSubmit.editReply).toHaveBeenCalledWith({
          content: expect.stringMatching(/no longer approved/i),
        });
      });

      it('aborts when the signup no longer exists', async () => {
        signupCollection.findById.mockResolvedValue(undefined);
        const modalSubmit = buildModalSubmit('great logs, welcome!');
        const interaction = addButtonInteraction(
          'great logs, welcome!',
          modalSubmit,
        );

        await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(modalSubmit.editReply).toHaveBeenCalledWith({
          content: expect.stringMatching(/no longer approved/i),
        });
      });

      it('returns false and asks the reviewer to retry when the modal token has already expired', async () => {
        const userSend = vi.fn().mockResolvedValue(undefined);
        const interaction = mockOf<ButtonInteraction>({
          customId: `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
          showModal: vi.fn().mockRejectedValue(unknownInteractionError()),
          user: { send: userSend },
        });

        const result = await service['handleButtonInteraction'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(result).toBe(false);
        expect(userSend).toHaveBeenCalledWith(
          expect.stringContaining('click the button again'),
        );
      });

      it('rethrows errors from showModal that are not a 10062', async () => {
        const interaction = mockOf<ButtonInteraction>({
          customId: `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
          showModal: vi.fn().mockRejectedValue(new Error('boom')),
          user: { send: vi.fn() },
        });

        await expect(
          service['handleButtonInteraction'](
            interaction,
            signup,
            signupId,
            reviewer,
            reviewMessage,
          ),
        ).rejects.toThrow('boom');
      });
    });

    describe('handleApprovalCommentInteractions retry loop', () => {
      const buildButtonInteraction = () =>
        mockOf<ButtonInteraction>({
          customId: `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
        });

      it('gives up without publishing an event after exhausting retry attempts', async () => {
        const awaitMessageComponent = vi
          .fn()
          .mockResolvedValue(buildButtonInteraction());
        const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });

        vi.spyOn(
          withInternals<{
            handleButtonInteraction: (...args: unknown[]) => Promise<unknown>;
          }>(service),
          'handleButtonInteraction',
        ).mockResolvedValue(false);

        await service['handleApprovalCommentInteractions'](
          dmMessage,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(awaitMessageComponent).toHaveBeenCalledTimes(
          MAX_MODAL_SHOW_ATTEMPTS,
        );
        expect(eventBus.publish).not.toHaveBeenCalled();
      });

      it('does not publish an event when the collector times out', async () => {
        const awaitMessageComponent = vi
          .fn()
          .mockRejectedValue(collectorTimeoutError());
        const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });

        await service['handleApprovalCommentInteractions'](
          dmMessage,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(eventBus.publish).not.toHaveBeenCalled();
      });
    });

    describe('requestApprovalComment', () => {
      it('swallows a non-timeout failure and logs it exactly once', async () => {
        const awaitMessageComponent = vi
          .fn()
          .mockRejectedValue(new Error('kaboom'));
        discordService.sendDirectMessage.mockResolvedValue(
          mockOf<Message<false>>({ awaitMessageComponent }),
        );

        await service.requestApprovalComment(signup, reviewer, reviewMessage);

        expect(service['logger'].error).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // Decline reason flow
  // ==========================================================================

  describe('decline reason flow', () => {
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

      it('defers before the write and edits the reply for a predefined reason', async () => {
        const interaction = mockOf<StringSelectMenuInteraction>({
          values: ['Not enough logs'],
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: vi.fn().mockResolvedValue(undefined),
          reply: vi.fn().mockResolvedValue(undefined),
        });

        await service['handleReasonSelection'](
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(interaction.deferReply).toHaveBeenCalledWith({
          flags: MessageFlags.Ephemeral,
        });
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(signupCollection.updateDeclineReason).toHaveBeenCalledWith(
          { discordId: 'abc123', encounter: 'DSR' },
          'Not enough logs',
        );

        expect(callOrder(interaction.deferReply)).toBeLessThan(
          callOrder(signupCollection.updateDeclineReason),
        );
        expect(callOrder(signupCollection.updateDeclineReason)).toBeLessThan(
          callOrder(interaction.editReply),
        );
      });
    });

    describe('handleCustomReasonSubmit', () => {
      it('defers before the write and edits the reply', async () => {
        const interaction = mockOf<ModalSubmitInteraction>({
          fields: {
            getTextInputValue: () => 'prog looks thin, try again next tier',
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: vi.fn().mockResolvedValue(undefined),
          reply: vi.fn().mockResolvedValue(undefined),
        });

        await service['handleCustomReasonSubmit'](
          interaction,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(interaction.deferReply).toHaveBeenCalledWith({
          flags: MessageFlags.Ephemeral,
        });
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(signupCollection.updateDeclineReason).toHaveBeenCalledWith(
          { discordId: 'abc123', encounter: 'DSR' },
          'prog looks thin, try again next tier',
        );

        expect(callOrder(interaction.deferReply)).toBeLessThan(
          callOrder(signupCollection.updateDeclineReason),
        );
        expect(callOrder(signupCollection.updateDeclineReason)).toBeLessThan(
          callOrder(interaction.editReply),
        );
      });

      it('still dispatches the decline reason when the Firestore write fails', async () => {
        signupCollection.updateDeclineReason.mockRejectedValue(
          new Error('firestore down'),
        );
        const dispatchSpy = vi
          .spyOn(
            withInternals<{
              dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
            }>(service),
            'dispatchDeclineReasonEvent',
          )
          .mockImplementation(() => undefined);
        const interaction = mockOf<ModalSubmitInteraction>({
          fields: { getTextInputValue: () => 'not enough recent prog' },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: vi.fn().mockResolvedValue(undefined),
        });

        await service['handleCustomReasonSubmit'](
          interaction,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(dispatchSpy).toHaveBeenCalledWith(
          signup,
          reviewer,
          reviewMessage,
          'not enough recent prog',
        );
        expect(interaction.editReply).toHaveBeenCalled();
      });

      it('treats a whitespace-only custom reason as a no-reason decline', async () => {
        const dispatchSpy = vi
          .spyOn(
            withInternals<{
              dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
            }>(service),
            'dispatchDeclineReasonEvent',
          )
          .mockImplementation(() => undefined);
        const interaction = mockOf<ModalSubmitInteraction>({
          fields: { getTextInputValue: () => '   ' },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: vi.fn().mockResolvedValue(undefined),
        });

        await service['handleCustomReasonSubmit'](
          interaction,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateDeclineReason).not.toHaveBeenCalled();
        expect(dispatchSpy).toHaveBeenCalledWith(
          signup,
          reviewer,
          reviewMessage,
        );
        expect(interaction.editReply).toHaveBeenCalledWith({
          content: expect.stringMatching(/without a specific reason/i),
        });
      });
    });

    describe('handleDeclineReasonInteractions retry loop', () => {
      const buildSelectInteraction = () =>
        mockOf<StringSelectMenuInteraction>({
          customId: `${DECLINE_REASON_SELECT_ID}-${signupId}`,
        });

      it('re-listens for a selection and retries after a recoverable modal failure', async () => {
        const awaitMessageComponent = vi
          .fn()
          .mockResolvedValue(buildSelectInteraction());
        const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });

        const handleReasonSelectionSpy = vi
          .spyOn(
            withInternals<{
              handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
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
        const awaitMessageComponent = vi
          .fn()
          .mockResolvedValue(buildSelectInteraction());
        const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });

        vi.spyOn(
          withInternals<{
            handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
          }>(service),
          'handleReasonSelection',
        ).mockResolvedValue(false);
        const dispatchSpy = vi
          .spyOn(
            withInternals<{
              dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
            }>(service),
            'dispatchDeclineReasonEvent',
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
        expect(dispatchSpy).toHaveBeenCalledWith(
          signup,
          reviewer,
          reviewMessage,
        );
      });

      it('still dispatches a no-reason decline when the collector times out', async () => {
        const awaitMessageComponent = vi
          .fn()
          .mockRejectedValue(collectorTimeoutError());
        const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });
        const dispatchSpy = vi
          .spyOn(
            withInternals<{
              dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
            }>(service),
            'dispatchDeclineReasonEvent',
          )
          .mockImplementation(() => undefined);

        await service['handleDeclineReasonInteractions'](
          dmMessage,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(dispatchSpy).toHaveBeenCalledWith(
          signup,
          reviewer,
          reviewMessage,
        );
      });

      it('logs a non-timeout collector error once and does not rethrow or dispatch', async () => {
        const awaitMessageComponent = vi
          .fn()
          .mockRejectedValue(new Error('kaboom'));
        const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });
        const dispatchSpy = vi
          .spyOn(
            withInternals<{
              dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
            }>(service),
            'dispatchDeclineReasonEvent',
          )
          .mockImplementation(() => undefined);

        await expect(
          service['handleDeclineReasonInteractions'](
            dmMessage,
            signup,
            reviewer,
            reviewMessage,
          ),
        ).resolves.toBeUndefined();

        expect(service['logger'].error).toHaveBeenCalledTimes(1);
        expect(dispatchSpy).not.toHaveBeenCalled();
      });
    });
  });
});
