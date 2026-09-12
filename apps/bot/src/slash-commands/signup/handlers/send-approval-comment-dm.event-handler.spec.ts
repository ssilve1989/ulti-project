import { Test, TestingModule } from '@nestjs/testing';
import { Encounter, type SignupDocument } from '@ulti-project/shared';
import type { EmbedBuilder, Message, User } from 'discord.js';
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
    message = mockOf<Message<true>>({
      embeds: [
        {
          title: 'Signup Approval - Dragonsong’s Reprise (Ultimate) 🐉',
          description:
            'Please react to approve ✅ or deny ❌ the following applicants request',
        },
      ],
    });
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
        embeds: expect.arrayContaining([expect.anything()]),
      }),
    );
  });

  it('strips the reviewer-facing description and retitles the embed for the applicant', async () => {
    const event = new SignupApprovedEvent(
      signup,
      settings,
      reviewedBy,
      message,
      'Great job on this clear!',
    );

    await handler.handle(event);

    // biome-ignore lint/nursery/noUnsafeTypeAssertion: mock.calls narrows discord.js's broad send() union to what the handler actually passes, matches project convention
    const { embeds } = discordService.sendDirectMessage.mock.calls[0][1] as {
      embeds: EmbedBuilder[];
    };
    const [embed] = embeds;

    expect(embed.data.description).toBeUndefined();
    expect(embed.data.title).toBe('Signup Approved - [DSR] Dragonsong Reprise');
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
