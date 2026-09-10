import { Test } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovalCommentCollectedEvent } from '../events/signup.events.js';
import { SignupApprovalCommentEventHandler } from './signup-approval-comment.event-handler.js';

describe('SignupApprovalCommentEventHandler', () => {
  let handler: SignupApprovalCommentEventHandler;
  let discordService: Mocked<DiscordService>;
  let message: Message<true>;
  let signup: SignupDocument;

  beforeEach(async () => {
    message = mockOf<Message<true>>({ id: 'review-message', embeds: [{}] });

    const fixture = await Test.createTestingModule({
      providers: [SignupApprovalCommentEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(SignupApprovalCommentEventHandler);
    discordService = fixture.get(DiscordService);

    signup = partialMock<SignupDocument>({
      discordId: 'user-1',
      encounter: 'DSR',
    });
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it('DMs the user an approval message containing the reviewer comment', async () => {
    const event = new SignupApprovalCommentCollectedEvent(
      signup,
      mockOf<User>({}),
      message,
      'great logs — see you in prog',
    );

    await handler.handle(event);

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

  it('does not throw when the DM cannot be delivered', async () => {
    discordService.sendDirectMessage.mockRejectedValue(
      new Error('Cannot send messages to this user'),
    );

    const event = new SignupApprovalCommentCollectedEvent(
      signup,
      mockOf<User>({}),
      message,
      'welcome aboard',
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});
