import { Test, type TestingModule } from '@nestjs/testing';
import { type SignupDocument } from '@ulti-project/shared';
import type {
  ButtonInteraction,
  Message,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { DiscordAPIError } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import {
  APPROVAL_COMMENT_ADD_BUTTON_ID,
  APPROVAL_COMMENT_MODAL_ID,
  APPROVAL_COMMENT_SKIP_BUTTON_ID,
} from './approval-comment.components.js';
import {
  CUSTOM_DECLINE_REASON_MODAL_ID,
  DECLINE_REASON_SELECT_ID,
} from './decline-reason.components.js';
import { ReviewDmFlowService } from './review-dm-flow.service.js';
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

const collectorTimeoutError = () =>
  Object.assign(new Error('Collector received no interactions'), {
    code: 'InteractionCollectorError',
  });

describe('ReviewDmFlowService', () => {
  let service: ReviewDmFlowService;
  let discordService: Mocked<DiscordService>;
  let signup: SignupDocument;
  let reviewer: User;
  const signupId = 'abc123-DSR';

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [ReviewDmFlowService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(ReviewDmFlowService);
    discordService = fixture.get(DiscordService);

    signup = partialMock<SignupDocument>({
      discordId: 'abc123',
      encounter: 'DSR',
      username: 'Tan Gigant',
    });
    reviewer = mockOf<User>({ id: 'reviewerId' });

    vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  /** A reviewer DM whose collector yields `interaction` on every wait. */
  const dmYielding = (interaction: unknown) => {
    const dm = mockOf<Message<false>>({
      awaitMessageComponent: vi.fn().mockResolvedValue(interaction),
    });
    discordService.sendDirectMessage.mockResolvedValue(dm);
    return dm;
  };

  const dmRejecting = (error: unknown) => {
    const dm = mockOf<Message<false>>({
      awaitMessageComponent: vi.fn().mockRejectedValue(error),
    });
    discordService.sendDirectMessage.mockResolvedValue(dm);
    return dm;
  };

  const modalSubmit = (customId: string, value: string | undefined) =>
    mockOf<ModalSubmitInteraction>({
      customId,
      fields: { getTextInputValue: () => value },
      reply: vi.fn().mockResolvedValue(undefined),
    });

  // ==========================================================================
  // Approval comment flow
  // ==========================================================================

  describe('collectApprovalComment', () => {
    const addButton = (submit: ModalSubmitInteraction) =>
      mockOf<ButtonInteraction>({
        customId: `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
        showModal: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        user: reviewer,
        awaitModalSubmit: vi.fn().mockResolvedValue(submit),
      });

    it('returns the trimmed comment and acks the reviewer when one is added', async () => {
      const submit = modalSubmit(
        `${APPROVAL_COMMENT_MODAL_ID}-${signupId}`,
        '  great logs, welcome!  ',
      );
      dmYielding(addButton(submit));

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBe('great logs, welcome!');
      expect(submit.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('great logs, welcome!'),
        }),
      );
    });

    it('returns undefined and acks when the reviewer skips', async () => {
      const button = mockOf<ButtonInteraction>({
        customId: `${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`,
        reply: vi.fn().mockResolvedValue(undefined),
        user: reviewer,
      });
      dmYielding(button);

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBeUndefined();
      expect(button.reply).toHaveBeenCalled();
    });

    it('returns undefined when the submitted comment is only whitespace', async () => {
      dmYielding(
        addButton(
          modalSubmit(`${APPROVAL_COMMENT_MODAL_ID}-${signupId}`, '   '),
        ),
      );

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBeUndefined();
    });

    it('returns undefined without logging an error on a collector timeout', async () => {
      dmRejecting(collectorTimeoutError());

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBeUndefined();
      expect(service['logger'].error).not.toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalled();
    });

    it('returns undefined and logs once on a non-timeout failure', async () => {
      dmRejecting(new Error('kaboom'));

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBeUndefined();
      expect(service['logger'].error).toHaveBeenCalledTimes(1);
    });

    it('re-offers the trigger when the modal fails to open, then gives up', async () => {
      const button = mockOf<ButtonInteraction>({
        customId: `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
        showModal: vi.fn().mockRejectedValue(unknownInteractionError()),
        reply: vi.fn().mockResolvedValue(undefined),
        user: { ...reviewer, send: vi.fn().mockResolvedValue(undefined) },
      });
      const dm = dmYielding(button);

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBeUndefined();
      expect(dm.awaitMessageComponent).toHaveBeenCalledTimes(3);
    });

    it('returns undefined when the reviewer DM cannot be sent', async () => {
      discordService.sendDirectMessage.mockRejectedValue(
        new Error('cannot DM this user'),
      );

      const result = await service.collectApprovalComment(signup, reviewer);

      expect(result).toBeUndefined();
      expect(service['logger'].error).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Decline reason flow
  // ==========================================================================

  describe('collectDeclineReason', () => {
    const select = (value: string, submit?: ModalSubmitInteraction) =>
      mockOf<StringSelectMenuInteraction>({
        customId: `${DECLINE_REASON_SELECT_ID}-${signupId}`,
        values: [value],
        showModal: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        user: reviewer,
        awaitModalSubmit: vi.fn().mockResolvedValue(submit),
      });

    it('returns the selected predefined reason and acks the reviewer', async () => {
      const interaction = select('Not enough logs');
      dmYielding(interaction);

      const result = await service.collectDeclineReason(signup, reviewer);

      expect(result).toBe('Not enough logs');
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Not enough logs'),
        }),
      );
    });

    it('returns the custom reason entered in the modal', async () => {
      dmYielding(
        select(
          CUSTOM_DECLINE_REASON_VALUE,
          modalSubmit(
            `${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`,
            '  prog looks thin, try next tier  ',
          ),
        ),
      );

      const result = await service.collectDeclineReason(signup, reviewer);

      expect(result).toBe('prog looks thin, try next tier');
    });

    it('returns undefined for a blank custom reason', async () => {
      dmYielding(
        select(
          CUSTOM_DECLINE_REASON_VALUE,
          modalSubmit(`${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`, '   '),
        ),
      );

      const result = await service.collectDeclineReason(signup, reviewer);

      expect(result).toBeUndefined();
    });

    it('returns undefined without logging an error on a collector timeout', async () => {
      dmRejecting(collectorTimeoutError());

      const result = await service.collectDeclineReason(signup, reviewer);

      expect(result).toBeUndefined();
      expect(service['logger'].error).not.toHaveBeenCalled();
    });

    it('returns undefined and logs once on a non-timeout failure', async () => {
      dmRejecting(new Error('kaboom'));

      const result = await service.collectDeclineReason(signup, reviewer);

      expect(result).toBeUndefined();
      expect(service['logger'].error).toHaveBeenCalledTimes(1);
    });
  });
});
