import { Test, TestingModule } from '@nestjs/testing';
import type { Message, StringSelectMenuInteraction, User } from 'discord.js';
import { DiscordAPIError } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
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

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [DeclineReasonRequestService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(DeclineReasonRequestService);

    signup = {
      discordId: 'abc123',
      encounter: 'DSR',
    } as SignupDocument;
    reviewer = { id: 'reviewerId' } as User;
    reviewMessage = {} as Message<true>;
    signupId = `${signup.discordId}-${signup.encounter}`;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleReasonSelection', () => {
    it('returns false and asks the reviewer to retry when the modal token has already expired', async () => {
      const userSend = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        values: [CUSTOM_DECLINE_REASON_VALUE],
        showModal: vi.fn().mockRejectedValue(unknownInteractionError()),
        user: { send: userSend },
      } as unknown as StringSelectMenuInteraction;

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
      const interaction = {
        values: [CUSTOM_DECLINE_REASON_VALUE],
        showModal: vi.fn().mockRejectedValue(new Error('boom')),
        user: { send: vi.fn() },
      } as unknown as StringSelectMenuInteraction;

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
      ({
        customId: `${DECLINE_REASON_SELECT_ID}-${signupId}`,
      }) as StringSelectMenuInteraction;

    it('re-listens for a selection and retries after a recoverable modal failure', async () => {
      const selectInteraction = buildSelectInteraction();
      const awaitMessageComponent = vi
        .fn()
        .mockResolvedValue(selectInteraction);
      const dmMessage = {
        awaitMessageComponent,
      } as unknown as Message<false>;

      const handleReasonSelectionSpy = vi
        .spyOn(service as any, 'handleReasonSelection')
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
      const dmMessage = {
        awaitMessageComponent,
      } as unknown as Message<false>;

      vi.spyOn(service as any, 'handleReasonSelection').mockResolvedValue(
        false,
      );
      const dispatchSpy = vi
        .spyOn(service as any, 'dispatchDeclineReasonEvent')
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
});
