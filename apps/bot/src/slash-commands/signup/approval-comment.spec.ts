import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  User,
} from 'discord.js';
import { DiscordAPIError } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { mockOf } from '../../test-utils/mock-factory.js';
import { collectApprovalComment } from './approval-comment.js';

const EXPIRED = 'click it again';

const unknownInteractionError = () =>
  new DiscordAPIError(
    { message: 'Unknown interaction', code: 10062 },
    10062,
    404,
    'POST',
    '/interactions/123/abc/callback',
    { body: undefined, files: undefined },
  );

const submission = (comment: string) =>
  mockOf<ModalSubmitInteraction>({
    fields: { getTextInputValue: vi.fn().mockReturnValue(comment) },
  });

const buttonInteraction = ({
  showModal = vi.fn().mockResolvedValue(undefined),
  awaitModalSubmit = vi.fn().mockResolvedValue(submission('looks good')),
  send = vi.fn().mockResolvedValue(undefined),
}: {
  showModal?: () => Promise<unknown>;
  awaitModalSubmit?: (options: unknown) => Promise<ModalSubmitInteraction>;
  send?: (content: string) => Promise<unknown>;
} = {}) => ({
  send,
  interaction: mockOf<ButtonInteraction>({
    showModal,
    awaitModalSubmit,
    message: { id: 'message-1' },
    user: mockOf<User>({ id: 'reviewer-1', send }),
  }),
});

const options = { deadline: Date.now() + 60_000, expiredMessage: EXPIRED };

describe('collectApprovalComment', () => {
  it('returns the trimmed comment from the submission', async () => {
    const { interaction } = buttonInteraction({
      awaitModalSubmit: vi.fn().mockResolvedValue(submission('  spaced  ')),
    });
    const state = { modalGeneration: 0 };

    const result = await collectApprovalComment(interaction, state, options);

    expect(result?.comment).toBe('spaced');
    expect(state.modalGeneration).toBe(1);
  });

  it('reports an empty comment as undefined rather than an empty string', async () => {
    const { interaction } = buttonInteraction({
      awaitModalSubmit: vi.fn().mockResolvedValue(submission('   ')),
    });

    const result = await collectApprovalComment(
      interaction,
      { modalGeneration: 0 },
      options,
    );

    expect(result?.comment).toBeUndefined();
  });

  // the click's token expired before the modal could open; the collector is
  // still running, so the reviewer just needs to click again
  it('DMs the reviewer and gives up when the modal cannot be shown', async () => {
    const { interaction, send } = buttonInteraction({
      showModal: vi.fn().mockRejectedValue(unknownInteractionError()),
    });

    const result = await collectApprovalComment(
      interaction,
      { modalGeneration: 0 },
      options,
    );

    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledWith(EXPIRED);
  });

  it('rethrows a showModal failure that is not an expired token', async () => {
    const { interaction } = buttonInteraction({
      showModal: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(
      collectApprovalComment(interaction, { modalGeneration: 0 }, options),
    ).rejects.toThrow('boom');
  });

  // a modal dismissed with Esc leaves its listener parked, so a later click's
  // submit reaches both listeners and only the newest may act on it
  it('yields nothing when a newer click has since shown its own modal', async () => {
    const state = { modalGeneration: 0 };
    const { interaction } = buttonInteraction({
      awaitModalSubmit: vi.fn().mockImplementation(() => {
        state.modalGeneration += 1;
        return Promise.resolve(submission('from the newer click'));
      }),
    });

    const result = await collectApprovalComment(interaction, state, options);

    expect(result).toBeUndefined();
  });

  it('scopes the submit listener to this reviewer and this message', async () => {
    const awaitModalSubmit = vi
      .fn()
      .mockResolvedValue(submission('looks good'));
    const { interaction } = buttonInteraction({ awaitModalSubmit });

    await collectApprovalComment(interaction, { modalGeneration: 0 }, options);

    const [{ filter }] = awaitModalSubmit.mock.calls[0];
    const from = (userId: string, messageId: string) =>
      mockOf<ModalSubmitInteraction>({
        user: { id: userId },
        message: { id: messageId },
      });

    expect(filter(from('reviewer-1', 'message-1'))).toBe(true);
    expect(filter(from('someone-else', 'message-1'))).toBe(false);
    expect(filter(from('reviewer-1', 'another-message'))).toBe(false);
  });

  // discord.js's Collector only arms its timer `if (options.time)`, and 0 is
  // falsy — a deadline already past must floor to 1, not 0, or the collector
  // waits forever instead of timing out immediately
  it('floors the timer to 1 when the deadline has already passed', async () => {
    const awaitModalSubmit = vi
      .fn()
      .mockResolvedValue(submission('looks good'));
    const { interaction } = buttonInteraction({ awaitModalSubmit });

    await collectApprovalComment(
      interaction,
      { modalGeneration: 0 },
      { deadline: Date.now() - 10_000, expiredMessage: EXPIRED },
    );

    expect(awaitModalSubmit.mock.calls[0][0].time).toBe(1);
  });

  it('waits the real remaining time when the deadline is still ahead', async () => {
    const awaitModalSubmit = vi
      .fn()
      .mockResolvedValue(submission('looks good'));
    const { interaction } = buttonInteraction({ awaitModalSubmit });

    await collectApprovalComment(
      interaction,
      { modalGeneration: 0 },
      { deadline: Date.now() + 60_000, expiredMessage: EXPIRED },
    );

    const { time } = awaitModalSubmit.mock.calls[0][0];
    expect(time).toBeGreaterThan(1);
    expect(time).toBeLessThanOrEqual(60_000);
  });

  // the caller decides whether a timeout ends the whole flow
  it('propagates the collector timeout to the caller', async () => {
    const timeout = { code: 'InteractionCollectorError' };
    const { interaction } = buttonInteraction({
      awaitModalSubmit: vi.fn().mockRejectedValue(timeout),
    });

    await expect(
      collectApprovalComment(interaction, { modalGeneration: 0 }, options),
    ).rejects.toBe(timeout);
  });
});
