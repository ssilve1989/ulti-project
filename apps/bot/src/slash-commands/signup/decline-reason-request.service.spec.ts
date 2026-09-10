import { Test, TestingModule } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type {
  Message,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { DiscordAPIError, MessageFlags } from 'discord.js';
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

describe('DeclineReasonRequestService', () => {
  let service: DeclineReasonRequestService;
  let signupCollection: Mocked<SignupCollection>;
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

    it('still dispatches a no-reason decline when the collector times out', async () => {
      const timeoutError = Object.assign(
        new Error('Collector received no interactions'),
        { code: 'InteractionCollectorError' },
      );
      const awaitMessageComponent = vi.fn().mockRejectedValue(timeoutError);
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

      expect(dispatchSpy).toHaveBeenCalledWith(signup, reviewer, reviewMessage);
    });

    it('captures a non-timeout collector error once and does not rethrow or dispatch', async () => {
      const awaitMessageComponent = vi
        .fn()
        .mockRejectedValue(new Error('kaboom'));
      const dmMessage = mockOf<Message<false>>({ awaitMessageComponent });
      const reportError = vi.spyOn(
        withInternals<{ reportError: (...args: unknown[]) => void }>(service),
        'reportError',
      );
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

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
