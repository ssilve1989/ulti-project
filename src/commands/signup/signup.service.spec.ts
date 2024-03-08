import { Test, TestingModule } from '@nestjs/testing';
import { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { DeepMocked, createMock } from '../../../test/create-mock.js';
import { DiscordService } from '../../discord/discord.service.js';
import { Settings } from '../settings/settings.interfaces.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';

import { SignupRepository } from '../../firebase/collections/signup.repository.js';
import { SignupDocument } from '../../firebase/models/signup.model.js';

describe('SignupService', () => {
  let service: SignupService;
  let messageReaction: DeepMocked<MessageReaction>;
  let user: DeepMocked<User>;
  let settings: DeepMocked<Settings>;
  let signup: DeepMocked<SignupDocument>;
  let repository: DeepMocked<SignupRepository>;
  let discordService: DeepMocked<DiscordService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SignupService],
    })
      .useMocker(() => createMock())
      .compile();

    service = module.get(SignupService);
    repository = module.get(SignupRepository);
    discordService = module.get(DiscordService);

    messageReaction = createMock<MessageReaction>({
      message: createMock<Message>({
        id: 'messageId',
        valueOf: () => '',
        edit: vi.fn(),
      }),
      emoji: createMock<ReactionEmoji>({
        name: 'emojiName',
        valueOf: () => '',
      }),
      valueOf: () => '',
    });

    user = createMock<User>({
      displayAvatarURL: () => 'http://someurl.com',
      valueOf: () => '',
      toString: () => '<@someuser>',
    });
    settings = createMock<Settings>();
    signup = createMock<SignupDocument>({
      reviewMessageId: 'messageId',
      reviewedBy: undefined,
      discordId: 'abc123',
    });
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

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      signup.discordId,
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED,
        embeds: expect.any(Array),
      }),
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
