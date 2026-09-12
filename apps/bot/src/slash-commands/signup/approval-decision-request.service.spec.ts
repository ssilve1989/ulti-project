import { Test, TestingModule } from '@nestjs/testing';
import { Encounter, type SignupDocument } from '@ulti-project/shared';
import {
  type ActionRowBuilder,
  type ButtonInteraction,
  DiscordjsErrorCodes,
  type Embed,
  type Message,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalMessageModalSubmitInteraction,
  type StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
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

// Stands in for discord.js's InteractionCollector: a single long-lived
// listener, exactly like the real one, so tests drive the same lifecycle
// production code relies on (one collector for the whole decision, not a
// fresh one per interaction).
function buildFakeCollector() {
  let collect: ((interaction: MessageComponentInteraction) => unknown) | null =
    null;
  let end: ((collected: unknown, reason: string) => void) | null = null;
  let ended = false;
  let resolveReady: () => void;
  // requestApprovalDecision awaits sendDirectMessage before the collector is
  // even created, so tests can't drive it until both `.on()` calls below have
  // actually happened — this resolves once they have.
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const stop = vi.fn(() => {
    if (ended) return;
    ended = true;
    end?.(new Map(), 'user');
  });

  const on = vi.fn((event: string, handler: (...args: never[]) => unknown) => {
    if (event === 'collect') {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a generic EventEmitter handler back to this fake collector's known event shape, matches project convention
      collect = handler as (
        interaction: MessageComponentInteraction,
      ) => unknown;
    }
    if (event === 'end') {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a generic EventEmitter handler back to this fake collector's known event shape
      end = handler as (collected: unknown, reason: string) => void;
      resolveReady();
    }
  });

  return {
    fake: { on, stop },
    // Simulates one interaction arriving and waits for production code's
    // (fire-and-forget, from the real EventEmitter's perspective) async
    // handler to finish before the test asserts on it.
    collect: async (interaction: MessageComponentInteraction) => {
      await ready;
      await collect?.(interaction);
    },
    // Simulates the collector's own `time` elapsing with nothing resolved.
    timeOut: async () => {
      await ready;
      if (ended) return;
      ended = true;
      end?.(new Map(), 'time');
    },
  };
}

describe('ApprovalDecisionRequestService', () => {
  let service: ApprovalDecisionRequestService;
  let discordService: Mocked<DiscordService>;
  let encountersComponentsService: Mocked<EncountersComponentsService>;
  let reviewer: User;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [ApprovalDecisionRequestService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(ApprovalDecisionRequestService);
    discordService = fixture.get(DiscordService);
    encountersComponentsService = fixture.get(EncountersComponentsService);
    reviewer = mockOf<User>({ id: 'reviewerId' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('collectDecision', () => {
    const selectRow = mockOf<ActionRowBuilder<StringSelectMenuBuilder>>({});

    const buildMessage = (
      fakeCollector: ReturnType<typeof buildFakeCollector>['fake'],
    ) =>
      mockOf<Message>({
        createMessageComponentCollector: vi.fn().mockReturnValue(fakeCollector),
      });

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
      const { fake, collect } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      const selectInteraction = buildSelectInteraction('point-a');
      await collect(selectInteraction);
      const approveInteraction = buildApproveInteraction();
      await collect(approveInteraction);

      expect(await resultPromise).toEqual({ progPoint: 'point-a' });
      expect(selectInteraction.update).toHaveBeenCalled();
      expect(approveInteraction.update).toHaveBeenCalledWith({
        components: [],
      });
      expect(fake.stop).toHaveBeenCalledTimes(1);
    });

    it('resolves with a trimmed comment when Approve with Comment is submitted', async () => {
      const { fake, collect } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      await collect(buildSelectInteraction('point-a'));
      const modalSubmit = buildModalSubmit('  Great job!  ');
      const approveWithCommentInteraction = buildApproveWithCommentInteraction(
        vi.fn().mockResolvedValue(modalSubmit),
      );
      await collect(approveWithCommentInteraction);

      expect(await resultPromise).toEqual({
        progPoint: 'point-a',
        comment: 'Great job!',
      });
      expect(approveWithCommentInteraction.showModal).toHaveBeenCalled();
      expect(modalSubmit.update).toHaveBeenCalledWith({ components: [] });
    });

    it('treats a blank submitted comment as no comment', async () => {
      const { fake, collect } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      await collect(buildSelectInteraction('point-a'));
      const modalSubmit = buildModalSubmit('   ');
      const approveWithCommentInteraction = buildApproveWithCommentInteraction(
        vi.fn().mockResolvedValue(modalSubmit),
      );
      await collect(approveWithCommentInteraction);

      expect(await resultPromise).toEqual({
        progPoint: 'point-a',
        comment: undefined,
      });
    });

    it('replies ephemeral and keeps collecting when a button is pressed before a prog point is selected', async () => {
      const { fake, collect } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      const earlyApprove = buildApproveInteraction();
      await collect(earlyApprove);
      await collect(buildSelectInteraction('point-a'));
      await collect(buildApproveInteraction());

      expect(earlyApprove.reply).toHaveBeenCalledWith({
        content: SIGNUP_MESSAGES.PROG_POINT_REQUIRED_BEFORE_DECISION,
        flags: MessageFlags.Ephemeral,
      });
      expect(await resultPromise).toEqual({ progPoint: 'point-a' });
    });

    it('propagates a timeout with nothing captured', async () => {
      const { fake, timeOut } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      await timeOut();

      await expect(resultPromise).rejects.toMatchObject({
        code: DiscordjsErrorCodes.InteractionCollectorError,
      });
    });

    it('propagates a timeout after a prog point was selected but before a button was pressed', async () => {
      const { fake, collect, timeOut } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      await collect(buildSelectInteraction('point-a'));
      await timeOut();

      await expect(resultPromise).rejects.toMatchObject({
        code: DiscordjsErrorCodes.InteractionCollectorError,
      });
    });

    it('propagates a timeout while waiting on the comment modal', async () => {
      const { fake, collect } = buildFakeCollector();
      const message = buildMessage(fake);
      const resultPromise = service['collectDecision'](
        message,
        reviewer,
        selectRow,
      );

      await collect(buildSelectInteraction('point-a'));
      const timeoutError = new Error('modal timed out');
      const approveWithCommentInteraction = buildApproveWithCommentInteraction(
        vi.fn().mockRejectedValue(timeoutError),
      );
      await collect(approveWithCommentInteraction);

      await expect(resultPromise).rejects.toThrow('modal timed out');
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
      encountersComponentsService.createProgPointSelectMenu.mockResolvedValue(
        mockOf<StringSelectMenuBuilder>({}),
      );

      const { fake, timeOut } = buildFakeCollector();
      const edit = vi.fn().mockResolvedValue(undefined);
      const message = mockOf<Message<false>>({
        createMessageComponentCollector: vi.fn().mockReturnValue(fake),
        edit,
      });
      discordService.sendDirectMessage.mockResolvedValue(message);

      const signup = partialMock<SignupDocument>({ encounter: Encounter.DSR });
      const sourceEmbed = mockOf<Embed>({});

      const resultPromise = service.requestApprovalDecision(
        signup,
        sourceEmbed,
        reviewer,
      );
      await timeOut();

      await expect(resultPromise).rejects.toMatchObject({
        code: DiscordjsErrorCodes.InteractionCollectorError,
      });

      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        reviewer.id,
        expect.objectContaining({ components: expect.any(Array) }),
      );
      expect(edit).toHaveBeenCalledWith({ components: [] });
    });
  });
});
