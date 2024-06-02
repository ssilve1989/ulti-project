import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { Colors, Message, User } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupApprovedEvent } from '../signup.events.js';
import { UpdateApprovalEmbedEventHandler } from './update-approval-embed.event-handler.js';

describe('UpdateApprovalEmbedEventHandler', () => {
  let handler: UpdateApprovalEmbedEventHandler;

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

  it('sends an updated embed', async () => {
    const message = createMock<Message<true>>();
    const approvedBy = createMock<User>({
      id: '12345',
      displayAvatarURL: () => 'http://test-url.png',
      valueOf: () => '',
      toString: () => '<@12345>',
    });

    await handler.handle(
      createMock<SignupApprovedEvent>({
        sourceMessage: message,
        approvedBy,
        guildId: 'test-guild',
      }),
    );

    expect(message.edit).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: {
            description: undefined,
            color: Colors.Green,
            footer: {
              text: 'Approved by Test User',
              icon_url: 'http://test-url.png',
            },
            timestamp: expect.any(String),
          },
        }),
      ],
    });
  });
});
