import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import { SignupReviewService } from './signup-review.service.js';
import { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { Signup } from './signup.interfaces.js';
import { Settings } from '../settings/settings.interfaces.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupRepository } from './signup.repository.js';

describe('SignupReviewService', () => {
  let service: SignupReviewService;
  let messageReaction: DeepMocked<MessageReaction>;
  let user: DeepMocked<User>;
  let settings: DeepMocked<Settings>;
  let signup: DeepMocked<Signup>;
  let repository: DeepMocked<SignupRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignupReviewService],
    })
      .useMocker(() => createMock())
      .compile();

    service = module.get(SignupReviewService);
    repository = module.get(SignupRepository);

    messageReaction = createMock<MessageReaction>({
      message: createMock<Message>({ id: 'messageId', valueOf: () => '' }),
      emoji: createMock<ReactionEmoji>({
        name: 'emojiName',
        valueOf: () => '',
      }),
      valueOf: () => '',
    });

    user = createMock<User>();
    settings = createMock<Settings>();
    signup = createMock<Signup>({
      reviewMessageId: 'messageId',
      reviewedBy: undefined,
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Add more tests here
  it('should handle approved reaction', async () => {
    repository.findByReviewId.mockResolvedValue(signup);

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const spy = jest
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
    repository.findByReviewId.mockResolvedValue(signup);

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.DECLINED;

    const spy = jest
      .spyOn(service, 'handleDeclinedReaction' as any)
      .mockResolvedValue({});

    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).toHaveBeenCalledWith(signup, messageReaction.message, user);
  });

  it('should return early if a signup has been reviewed', async () => {
    repository.findByReviewId.mockResolvedValue({
      ...signup,
      reviewedBy: user.id,
    });

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    await service['handleReaction'](messageReaction, user, settings);

    const spy = jest.spyOn(service, 'handleApprovedReaction' as any);
    expect(spy).not.toHaveBeenCalled();
  });
});
