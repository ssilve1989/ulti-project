import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { Colors, Message, User } from 'discord.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import type { SignupDocument } from '../../../../firebase/models/signup.model.js';
import { SignupApprovedEvent, SignupDeclinedEvent } from '../signup.events.js';
import { UpdateApprovalEmbedEventHandler } from './signup-embed.event-handler.js';

describe('SignupEmbedEventHandler', () => {
  let handler: UpdateApprovalEmbedEventHandler;

  const message = createMock<Message<true>>({
    guildId: '',
    valueOf: () => '',
  });

  const reviewedBy = createMock<User>({
    id: '12345',
    displayAvatarURL: () => 'http://test-url.png',
    valueOf: () => '',
    toString: () => '<@12345>',
  });

  const cases = [
    {
      color: Colors.Green,
      case: 'handles an approval event',
      event: new SignupApprovedEvent(
        createMock(),
        createMock(),
        reviewedBy,
        message,
      ),
      footer: 'Approved by Test User',
    },
    {
      color: Colors.Red,
      case: 'handles a declined event',
      event: new SignupDeclinedEvent(
        createMock<SignupDocument>({ discordId: '12345' }),
        reviewedBy,
        message,
      ),
      footer: 'Declined by Test User',
      content: 'Declined <@12345>',
    },
  ];

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [UpdateApprovalEmbedEventHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(UpdateApprovalEmbedEventHandler);

    const discordService =
      fixture.get<DeepMocked<DiscordService>>(DiscordService);

    discordService.getDisplayName.mockResolvedValueOnce('Test User');
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it.each(cases)('$case', async ({ event, footer, color, content }) => {
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
