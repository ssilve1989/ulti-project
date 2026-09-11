import type { Logger } from '@nestjs/common';
import {
  DiscordAPIError,
  type MessageComponentInteraction,
  type ModalBuilder,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { mockOf } from '../../test-utils/mock-factory.js';
import { showModalOrAskRetry } from './reviewer-follow-up-dm.helpers.js';

const unknownInteractionError = () =>
  new DiscordAPIError(
    { message: 'Unknown interaction', code: 10062 },
    10062,
    404,
    'POST',
    '/interactions/123/abc/callback',
    { body: undefined, files: undefined },
  );

const modal = mockOf<ModalBuilder>({});
const logger = mockOf<Logger>({ warn: vi.fn() });

const interactionWith = (showModal: () => Promise<unknown>) =>
  mockOf<MessageComponentInteraction>({
    showModal: vi.fn(showModal),
    user: { send: vi.fn().mockResolvedValue(undefined) },
  });

describe('showModalOrAskRetry', () => {
  it('returns true and does not DM the reviewer when the modal shows', async () => {
    const interaction = interactionWith(() => Promise.resolve());

    await expect(
      showModalOrAskRetry(interaction, modal, {
        signupId: 'abc-DSR',
        retryPrompt: 'click it again',
        logger,
      }),
    ).resolves.toBe(true);

    expect(interaction.user.send).not.toHaveBeenCalled();
  });

  it('returns false and DMs the retry prompt when the token has expired (10062)', async () => {
    const interaction = interactionWith(() =>
      Promise.reject(unknownInteractionError()),
    );

    await expect(
      showModalOrAskRetry(interaction, modal, {
        signupId: 'abc-DSR',
        retryPrompt: 'click it again',
        logger,
      }),
    ).resolves.toBe(false);

    expect(interaction.user.send).toHaveBeenCalledWith('click it again');
  });

  it('rethrows a non-10062 error', async () => {
    const interaction = interactionWith(() =>
      Promise.reject(new Error('boom')),
    );

    await expect(
      showModalOrAskRetry(interaction, modal, {
        signupId: 'abc-DSR',
        retryPrompt: 'click it again',
        logger,
      }),
    ).rejects.toThrow('boom');

    expect(interaction.user.send).not.toHaveBeenCalled();
  });
});
