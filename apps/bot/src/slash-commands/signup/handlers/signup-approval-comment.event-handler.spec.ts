import { Test } from '@nestjs/testing';
import {
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
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

  it('sends the DM with only content when the review message has no embed', async () => {
    const embedlessMessage = mockOf<Message<true>>({
      id: 'review-message',
      embeds: [],
    });
    const event = new SignupApprovalCommentCollectedEvent(
      signup,
      mockOf<User>({}),
      embedlessMessage,
      'no embed but still approved',
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();

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
    const event = new SignupApprovalCommentCollectedEvent(
      clearedSignup,
      mockOf<User>({}),
      message,
      'gg on the clear',
    );

    await handler.handle(event);

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

    const event = new SignupApprovalCommentCollectedEvent(
      signup,
      mockOf<User>({}),
      message,
      'welcome aboard',
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});
