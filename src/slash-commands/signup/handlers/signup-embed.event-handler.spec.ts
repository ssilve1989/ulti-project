import { Test } from '@nestjs/testing';
import { Colors, Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from '../events/signup.events.js';
import { UpdateApprovalEmbedEventHandler } from './signup-embed.event-handler.js';

describe('SignupEmbedEventHandler', () => {
  let handler: UpdateApprovalEmbedEventHandler;

  const message = {
    guildId: '',
    valueOf: () => '',
    edit: vi.fn(),
  } as any;

  const reviewedBy = {
    id: '12345',
    displayAvatarURL: () => 'http://test-url.png',
    valueOf: () => '',
    toString: () => '<@12345>',
  } as User;

  const cases = [
    {
      color: Colors.Green,
      case: 'handles an approval event',
      event: new SignupApprovedEvent(
        {} as SignupDocument,
        {} as SignupDocument,
        reviewedBy,
        message,
      ),
      footer: 'Approved by Test User',
    },
    {
      color: Colors.Red,
      case: 'handles a declined event',
      event: new SignupDeclinedEvent(
        { discordId: '12345' } as SignupDocument,
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
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
      .compile();

    handler = fixture.get(UpdateApprovalEmbedEventHandler);

    const discordService = fixture.get(DiscordService);

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
