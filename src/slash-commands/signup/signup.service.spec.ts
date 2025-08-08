import { Test, TestingModule } from '@nestjs/testing';
import { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';

// TODO: Actually assert approval/decline functionality, not just that they were called
describe('SignupService', () => {
  let service: SignupService;
  let messageReaction: any;
  let user: any;
  let settings: any;
  let signup: any;
  let repository: any;
  let discordService: any;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [SignupService],
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

    service = fixture.get(SignupService);
    repository = fixture.get(SignupCollection);
    discordService = fixture.get(DiscordService);

    messageReaction = {
      message: {
        id: 'messageId',
        valueOf: () => '',
        edit: vi.fn(),
        inGuild: vi.fn().mockReturnValue(true),
      },
      emoji: {
        name: 'emojiName',
        valueOf: () => '',
      },
      valueOf: () => '',
    };

    user = {
      displayAvatarURL: () => 'http://someurl.com',
      valueOf: () => '',
      toString: () => '<@someuser>',
      id: 'user123',
    };
    settings = {} as SettingsDocument;
    signup = {
      reviewMessageId: 'messageId',
      reviewedBy: undefined,
      discordId: 'abc123',
    } as SignupDocument;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add more tests here
  it('should handle approved reaction', async () => {
    repository.findByReviewId.mockResolvedValue(signup);

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const spy = vi
      .spyOn(service, 'handleApprovedReaction' as any)
      .mockResolvedValue({});

    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).toHaveBeenCalledWith(
      signup,
      messageReaction.message,
      user,
      settings,
    );
  });

  it('should handle a declined reaction', async () => {
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.DECLINED;

    repository.findByReviewId.mockResolvedValueOnce(signup);
    discordService.getDisplayName.mockResolvedValueOnce('someuser');
    repository.updateSignupStatus.mockResolvedValueOnce({} as any);
    vi.spyOn(messageReaction.message, 'edit').mockResolvedValueOnce({} as any);

    const handleDeclineSpy = vi.spyOn(service, 'handleDeclinedReaction' as any);

    await service['handleReaction'](messageReaction, user, settings);

    expect(handleDeclineSpy).toHaveBeenCalledWith(
      signup,
      messageReaction.message,
      user,
    );
  });

  it('should return early if a signup has been reviewed', async () => {
    repository.findByReviewId.mockResolvedValue({
      ...signup,
      reviewedBy: user.id,
    });

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    await service['handleReaction'](messageReaction, user, settings);

    const spy = vi.spyOn(service, 'handleApprovedReaction' as any);
    expect(spy).not.toHaveBeenCalled();
  });
});
