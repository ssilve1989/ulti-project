import { Test } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { Colors } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from '../events/signup.events.js';
import { UpdateApprovalEmbedEventHandler } from './signup-embed.event-handler.js';

describe('SignupEmbedEventHandler', () => {
  let handler: UpdateApprovalEmbedEventHandler;
  let message: Message<true>;

  const reviewedBy = mockOf<User>({
    id: '12345',
    displayAvatarURL: () => 'http://test-url.png',
    toString: () => '<@12345>',
  });

  const cases = [
    {
      color: Colors.Green,
      case: 'handles an approval event',
      createEvent: (msg: Message<true>) =>
        new SignupApprovedEvent(
          createAutoMock<SignupDocument>(),
          createAutoMock<SignupDocument>(),
          reviewedBy,
          msg,
        ),
      footer: 'Approved by Test User',
    },
    {
      color: Colors.Red,
      case: 'handles a declined event',
      createEvent: (msg: Message<true>) =>
        new SignupDeclinedEvent(
          partialMock<SignupDocument>({ discordId: '12345' }),
          reviewedBy,
          msg,
        ),
      footer: 'Declined by Test User',
      content: 'Declined <@12345>',
    },
  ];

  beforeEach(async () => {
    message = mockOf<Message<true>>({
      guildId: '',
      edit: vi.fn().mockResolvedValue(undefined),
      embeds: [{}],
    });

    const fixture = await Test.createTestingModule({
      providers: [UpdateApprovalEmbedEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(UpdateApprovalEmbedEventHandler);

    const discordService = fixture.get<Mocked<DiscordService>>(DiscordService);

    discordService.getDisplayName.mockResolvedValueOnce('Test User');
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it.each(cases)('$case', async ({ createEvent, footer, color, content }) => {
    const event = createEvent(message);
    await handler.handle(event);

    expect(message.edit).toHaveBeenCalledWith({
      content,
      embeds: [
        expect.objectContaining({
          data: {
            color,
            description: undefined,
            footer: {
              text: footer,
              icon_url: 'http://test-url.png',
            },
            timestamp: expect.any(String),
          },
        }),
      ],
    });
  });
});
