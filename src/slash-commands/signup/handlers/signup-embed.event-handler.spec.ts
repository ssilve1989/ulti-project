import { Test } from '@nestjs/testing';
import type { Message, User } from 'discord.js';
import { Colors } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from '../events/signup.events.js';
import { UpdateApprovalEmbedEventHandler } from './signup-embed.event-handler.js';

describe('SignupEmbedEventHandler', () => {
  let handler: UpdateApprovalEmbedEventHandler;
  let message: Message<true>;

  const reviewedBy = {
    id: '12345',
    displayAvatarURL: () => 'http://test-url.png',
    toString: () => '<@12345>',
  } as unknown as User;

  const cases = [
    {
      color: Colors.Green,
      case: 'handles an approval event',
      createEvent: (msg: Message<true>) =>
        new SignupApprovedEvent(
          createAutoMock() as unknown as SignupDocument,
          createAutoMock() as unknown as SignupDocument,
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
          { discordId: '12345' } as SignupDocument,
          reviewedBy,
          msg,
        ),
      footer: 'Declined by Test User',
      content: 'Declined <@12345>',
    },
  ];

  beforeEach(async () => {
    message = {
      guildId: '',
      edit: vi.fn().mockResolvedValue(undefined),
      embeds: [{}],
    } as unknown as Message<true>;

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
