import { Test } from '@nestjs/testing';
import {
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovalCommentNotifier } from './signup-approval-comment.notifier.js';

describe('SignupApprovalCommentNotifier', () => {
  let notifier: SignupApprovalCommentNotifier;
  let discordService: Mocked<DiscordService>;
  let message: Message<true>;
  let signup: SignupDocument;

  beforeEach(async () => {
    message = mockOf<Message<true>>({ id: 'review-message', embeds: [{}] });

    const fixture = await Test.createTestingModule({
      providers: [SignupApprovalCommentNotifier],
    })
      .useMocker(createAutoMock)
      .compile();

    notifier = fixture.get(SignupApprovalCommentNotifier);
    discordService = fixture.get(DiscordService);

    signup = partialMock<SignupDocument>({
      discordId: 'user-1',
      encounter: 'DSR',
    });
  });

  it('is defined', () => {
    expect(notifier).toBeDefined();
  });

  it('DMs the user an approval message containing the reviewer comment', async () => {
    await notifier.notify(signup, message, 'great logs — see you in prog');

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        content: expect.stringContaining('great logs — see you in prog'),
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({ title: 'Signup Approved' }),
          }),
        ],
      }),
    );
  });

  it('drops the reviewer-facing prompt from the copied review embed', async () => {
    const reviewMessage = mockOf<Message<true>>({
      id: 'review-message',
      embeds: [
        {
          title: 'Signup Approval - DSR',
          description: 'Please react to approve ✅ or deny ❌ the request',
        },
      ],
    });

    await notifier.notify(signup, reviewMessage, 'welcome aboard');

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.not.objectContaining({
              description: expect.anything(),
            }),
          }),
        ],
      }),
    );
  });

  it('sends the DM with only content when the review message has no embed', async () => {
    const embedlessMessage = mockOf<Message<true>>({
      id: 'review-message',
      embeds: [],
    });

    await expect(
      notifier.notify(signup, embedlessMessage, 'no embed but still approved'),
    ).resolves.toBeUndefined();

    const payload = vi.mocked(discordService.sendDirectMessage).mock
      .calls[0][1];
    expect(payload).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('no embed but still approved'),
      }),
    );
    expect(payload).not.toHaveProperty('embeds');
  });

  it('uses clear-congratulations wording for a cleared signup', async () => {
    const clearedSignup = partialMock<SignupDocument>({
      discordId: 'user-1',
      encounter: 'DSR',
      partyStatus: PartyStatus.Cleared,
    });

    await notifier.notify(clearedSignup, message, 'gg on the clear');

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        content: expect.stringContaining('Congratulations on clearing'),
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({ title: 'Congratulations!' }),
          }),
        ],
      }),
    );

    const payload = vi.mocked(discordService.sendDirectMessage).mock
      .calls[0][1];
    expect(payload).toEqual(
      expect.objectContaining({
        content: expect.stringContaining(EncounterFriendlyDescription.DSR),
      }),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('gg on the clear'),
      }),
    );
  });

  it('does not throw when the DM cannot be delivered', async () => {
    discordService.sendDirectMessage.mockRejectedValue(
      new Error('Cannot send messages to this user'),
    );

    await expect(
      notifier.notify(signup, message, 'welcome aboard'),
    ).resolves.toBeUndefined();
  });
});
