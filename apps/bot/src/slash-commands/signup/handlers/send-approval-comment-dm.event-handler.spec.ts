import { Test, TestingModule } from '@nestjs/testing';
import { Encounter, type SignupDocument } from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { SendApprovalCommentDmEventHandler } from './send-approval-comment-dm.event-handler.js';

describe('SendApprovalCommentDmEventHandler', () => {
  let handler: SendApprovalCommentDmEventHandler;
  let discordService: Mocked<DiscordService>;
  let signup: SignupDocument;
  let settings: SettingsDocument;
  let reviewedBy: User;
  let message: Message<true>;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [SendApprovalCommentDmEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(SendApprovalCommentDmEventHandler);
    discordService = fixture.get(DiscordService);

    signup = partialMock<SignupDocument>({
      discordId: 'applicantId',
      encounter: Encounter.DSR,
    });
    settings = partialMock<SettingsDocument>({});
    reviewedBy = mockOf<User>({ id: 'reviewerId' });
    message = mockOf<Message<true>>({});
  });

  it('DMs the applicant when a comment is present', async () => {
    const event = new SignupApprovedEvent(
      signup,
      settings,
      reviewedBy,
      message,
      'Great job on this clear!',
    );

    await handler.handle(event);

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'applicantId',
      expect.objectContaining({
        content: expect.stringContaining('Great job on this clear!'),
      }),
    );
  });

  it('quotes every line of a multi-line comment', async () => {
    const event = new SignupApprovedEvent(
      signup,
      settings,
      reviewedBy,
      message,
      'Great clear!\nWatch your uptime next time.',
    );

    await handler.handle(event);

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'applicantId',
      expect.objectContaining({
        content: expect.stringContaining(
          '> Great clear!\n> Watch your uptime next time.',
        ),
      }),
    );
  });

  it('does nothing when no comment is present', async () => {
    const event = new SignupApprovedEvent(
      signup,
      settings,
      reviewedBy,
      message,
    );

    await handler.handle(event);

    expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('reports and swallows a DM failure without throwing', async () => {
    discordService.sendDirectMessage.mockRejectedValue(new Error('DMs closed'));
    const event = new SignupApprovedEvent(
      signup,
      settings,
      reviewedBy,
      message,
      'Great job on this clear!',
    );

    await expect(handler.handle(event)).resolves.toBeUndefined();
  });
});
