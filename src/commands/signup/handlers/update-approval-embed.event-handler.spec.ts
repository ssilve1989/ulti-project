import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { Colors, Message, User } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupApprovedEvent, SignupDeclinedEvent } from '../signup.events.js';
import { UpdateApprovalEmbedEventHandler } from './update-approval-embed.event-handler.js';

describe('UpdateApprovalEmbedEventHandler', () => {
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
      description: 'handles an approval event',
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
      description: 'handles a declined event',
      event: new SignupDeclinedEvent(createMock(), reviewedBy, message),
      footer: 'Declined by Test User',
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

  it.each(cases)('$description', async ({ event, footer, color }) => {
    await handler.handle(event);

    expect(message.edit).toHaveBeenCalledWith({
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
