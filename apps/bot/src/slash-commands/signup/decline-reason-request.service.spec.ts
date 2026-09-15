import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { type SignupDocument, SignupStatus } from '@ulti-project/shared';
import type {
  Message,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import {
  DiscordAPIError,
  DiscordjsError,
  DiscordjsErrorCodes,
  MessageFlags,
} from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
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
import { SignupDeclineReasonCollectedEvent } from './events/signup.events.js';
import {
  CUSTOM_DECLINE_REASON_VALUE,
  SIGNUP_DECLINE_REASONS,
} from './signup.consts.js';

const unknownInteractionError = () =>
  new DiscordAPIError(
    { message: 'Unknown interaction', code: 10062 },
    10062,
    404,
    'POST',
    '/interactions/123/abc/callback',
    { body: undefined, files: undefined },
  );

// DiscordjsError's constructor is TS-private, but the service checks
// `instanceof DiscordjsError`, so the timeout paths need a genuine instance
const collectorTimeoutError = (): DiscordjsError =>
  Reflect.construct(DiscordjsError, [
    DiscordjsErrorCodes.InteractionCollectorError,
    'time',
  ]);

describe('DeclineReasonRequestService', () => {
  let service: DeclineReasonRequestService;
  let signupCollection: Mocked<SignupCollection>;
  let eventBus: Mocked<EventBus>;
  let signup: SignupDocument;
  let reviewer: User;
  let reviewMessage: Message<true>;
  let signupId: string;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [DeclineReasonRequestService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(DeclineReasonRequestService);
    signupCollection = fixture.get(SignupCollection);
    eventBus = fixture.get(EventBus);

    signup = partialMock<SignupDocument>({
      discordId: 'abc123',
      encounter: 'DSR',
    });
    reviewer = mockOf<User>({ id: 'reviewerId' });
    reviewMessage = mockOf<Message<true>>({});
    signupId = `${signup.discordId}-${signup.encounter}`;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
            dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
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
          dispatchDeclineReasonEvent: (...args: unknown[]) => unknown;
        }>(service),
        'handleReasonSelection',
      ).mockResolvedValue(false);
      const dispatchSpy = vi
        .spyOn(
          withInternals<{
            handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
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
      expect(dispatchSpy).toHaveBeenCalledWith(signup, reviewer, reviewMessage);
    });
  });

  describe('recording the decline reason', () => {
    const reason = SIGNUP_DECLINE_REASONS[0];

    const reasonSelection = () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      return {
        reply,
        interaction: mockOf<StringSelectMenuInteraction>({
          values: [reason],
          reply,
        }),
      };
    };

    const customReasonSubmit = () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      return {
        reply,
        interaction: mockOf<ModalSubmitInteraction>({
          fields: { getTextInputValue: vi.fn().mockReturnValue('custom') },
          reply,
        }),
      };
    };

    const timedOutReasonRequest = () =>
      mockOf<Message<false>>({
        awaitMessageComponent: vi
          .fn()
          .mockRejectedValue(collectorTimeoutError()),
      });

    const signupWithStatus = (status: SignupStatus) =>
      partialMock<SignupDocument>({ ...signup, status });

    describe('while the signup is still declined', () => {
      beforeEach(() => {
        signupCollection.findById.mockResolvedValue(
          signupWithStatus(SignupStatus.DECLINED),
        );
      });

      it('records a predefined reason, publishes it and confirms', async () => {
        const selection = reasonSelection();

        await service['handleReasonSelection'](
          selection.interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateDeclineReason).toHaveBeenCalledWith(
          { discordId: 'abc123', encounter: 'DSR' },
          reason,
        );
        expect(eventBus.publish).toHaveBeenCalledWith(
          new SignupDeclineReasonCollectedEvent(
            signup,
            reviewer,
            reviewMessage,
            reason,
          ),
        );
        expect(selection.reply).toHaveBeenCalledWith({
          content: `✅ Decline reason recorded: "${reason}"`,
          flags: MessageFlags.Ephemeral,
        });
      });

      it('records a custom reason, publishes it and confirms', async () => {
        const submit = customReasonSubmit();

        await service['handleCustomReasonSubmit'](
          submit.interaction,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateDeclineReason).toHaveBeenCalledWith(
          { discordId: 'abc123', encounter: 'DSR' },
          'custom',
        );
        expect(eventBus.publish).toHaveBeenCalledWith(
          new SignupDeclineReasonCollectedEvent(
            signup,
            reviewer,
            reviewMessage,
            'custom',
          ),
        );
        expect(submit.reply).toHaveBeenCalledWith({
          content: '✅ Custom decline reason recorded: "custom"',
          flags: MessageFlags.Ephemeral,
        });
      });

      it('publishes a decline without a reason when the request times out', async () => {
        await service['handleDeclineReasonInteractions'](
          timedOutReasonRequest(),
          signup,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateDeclineReason).not.toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledWith(
          new SignupDeclineReasonCollectedEvent(
            signup,
            reviewer,
            reviewMessage,
          ),
        );
      });
    });

    describe('once /edit-signup has approved the signup', () => {
      const skippedReply = {
        content:
          'This signup has since been approved, so no decline reason was recorded.',
        flags: MessageFlags.Ephemeral,
      };

      beforeEach(() => {
        signupCollection.findById.mockResolvedValue(
          signupWithStatus(SignupStatus.APPROVED),
        );
      });

      it('records and publishes no predefined reason, and tells the reviewer why', async () => {
        const selection = reasonSelection();

        await service['handleReasonSelection'](
          selection.interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.findById).toHaveBeenCalledWith('abc123-DSR');
        expect(signupCollection.updateDeclineReason).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(selection.reply).toHaveBeenCalledWith(skippedReply);
      });

      it('records and publishes no custom reason, and tells the reviewer why', async () => {
        const submit = customReasonSubmit();

        await service['handleCustomReasonSubmit'](
          submit.interaction,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.updateDeclineReason).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(submit.reply).toHaveBeenCalledWith(skippedReply);
      });

      it('publishes no decline when the request times out', async () => {
        await service['handleDeclineReasonInteractions'](
          timedOutReasonRequest(),
          signup,
          reviewer,
          reviewMessage,
        );

        expect(signupCollection.findById).toHaveBeenCalledWith('abc123-DSR');
        expect(eventBus.publish).not.toHaveBeenCalled();
      });

      it('publishes no decline when giving up on the custom reason modal', async () => {
        const dmMessage = mockOf<Message<false>>({
          awaitMessageComponent: vi.fn().mockResolvedValue(
            mockOf<StringSelectMenuInteraction>({
              customId: `${DECLINE_REASON_SELECT_ID}-${signupId}`,
            }),
          ),
        });
        vi.spyOn(
          withInternals<{
            handleReasonSelection: (...args: unknown[]) => Promise<unknown>;
          }>(service),
          'handleReasonSelection',
        ).mockResolvedValue(false);

        await service['handleDeclineReasonInteractions'](
          dmMessage,
          signup,
          reviewer,
          reviewMessage,
        );

        expect(eventBus.publish).not.toHaveBeenCalled();
      });
    });
  });
});
