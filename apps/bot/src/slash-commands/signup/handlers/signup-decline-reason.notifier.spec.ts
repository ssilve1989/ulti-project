import { Test } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SIGNUP_MESSAGES } from '../signup.consts.js';
import { SignupDeclineReasonNotifier } from './signup-decline-reason.notifier.js';

describe('SignupDeclineReasonNotifier', () => {
  let notifier: SignupDeclineReasonNotifier;
  let discordService: Mocked<DiscordService>;
  let message: Message<true>;
  let signup: SignupDocument;

  beforeEach(async () => {
    message = mockOf<Message<true>>({
      id: 'review-message',
      embeds: [{ title: 'Signup Approval - DSR' }],
    });

    const fixture = await Test.createTestingModule({
      providers: [SignupDeclineReasonNotifier],
    })
      .useMocker(createAutoMock)
      .compile();

    notifier = fixture.get(SignupDeclineReasonNotifier);
    discordService = fixture.get(DiscordService);

    signup = partialMock<SignupDocument>({
      discordId: 'user-1',
      encounter: 'DSR',
    });
  });

  it('DMs the user the decline reason with a retitled embed', async () => {
    await notifier.notify(signup, message, 'Not enough logs');

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        content: expect.stringContaining('Not enough logs'),
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({ title: 'Signup Declined' }),
          }),
        ],
      }),
    );
  });

  it('falls back to the generic denial copy when no reason was given', async () => {
    await notifier.notify(signup, message, undefined);

    const payload = vi.mocked(discordService.sendDirectMessage).mock
      .calls[0][1];
    expect(payload).toEqual(
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED,
      }),
    );
  });

  it('does not throw when the DM cannot be delivered', async () => {
    discordService.sendDirectMessage.mockRejectedValue(
      new Error('Cannot send messages to this user'),
    );

    await expect(
      notifier.notify(signup, message, 'Not enough logs'),
    ).resolves.toBeUndefined();
  });
});
