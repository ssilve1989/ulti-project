import { Test, TestingModule } from '@nestjs/testing';
import type { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  PartyStatus,
  type PendingSignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { DeclineReasonRequestService } from './decline-reason-request.service.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';

// TODO: Actually assert approval/decline functionality, not just that they were called
describe('SignupService', () => {
  let service: SignupService;
  let messageReaction: MessageReaction;
  let user: User;
  let settings: SettingsDocument;
  let signup: PendingSignupDocument;
  let repository: Mocked<SignupCollection>;
  let discordService: Mocked<DiscordService>;
  let declineReasonRequestService: Mocked<DeclineReasonRequestService>;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [SignupService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(SignupService);
    repository = fixture.get(SignupCollection);
    discordService = fixture.get(DiscordService);
    declineReasonRequestService = fixture.get(DeclineReasonRequestService);

    messageReaction = {
      message: {
        id: 'messageId',
        edit: vi.fn().mockResolvedValue(undefined),
        embeds: [],
        inGuild: vi.fn().mockReturnValue(true),
      } as unknown as Message<boolean>,
      emoji: {
        name: 'emojiName',
      } as unknown as ReactionEmoji,
    } as unknown as MessageReaction;

    user = {
      id: 'userId',
      displayAvatarURL: () => 'http://someurl.com',
      username: 'reviewer-name',
      toString: () => '<@someuser>',
    } as unknown as User;
    settings = {} as SettingsDocument;
    signup = {
      character: 'Alpha',
      discordId: 'abc123',
      encounter: Encounter.DSR,
      expiresAt: {} as never,
      progPointRequested: 'P6',
      reviewMessageId: 'messageId',
      role: 'WAR',
      status: SignupStatus.PENDING,
      username: 'AlphaUser',
      world: 'Gilgamesh',
    };
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
      status: SignupStatus.APPROVED,
      reviewedBy: user.id,
    });

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const spy = vi.spyOn(service, 'handleApprovedReaction' as any);
    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).not.toHaveBeenCalled();
  });

  it('should persist approved reactions through approveSignup', async () => {
    const getPartyStatusSpy = vi
      .spyOn(service as any, 'getPartyStatus')
      .mockResolvedValue(PartyStatus.ProgParty);
    vi.spyOn(service as any, 'confirmProgPoint').mockResolvedValue('P6 Enrage');

    await service['handleApprovedReaction'](
      signup,
      messageReaction.message as Message<true>,
      user,
      settings,
    );

    expect(getPartyStatusSpy).toHaveBeenCalledWith(Encounter.DSR, 'P6 Enrage');
    expect(repository.approveSignup).toHaveBeenCalledWith(
      {
        discordId: signup.discordId,
        encounter: signup.encounter,
        progPoint: 'P6 Enrage',
        partyStatus: PartyStatus.ProgParty,
      },
      user.username,
    );
  });

  it('should persist declined reactions through declineSignup', async () => {
    declineReasonRequestService.requestDeclineReason.mockResolvedValue();

    await service['handleDeclinedReaction'](
      signup,
      messageReaction.message as Message<true>,
      user,
    );

    expect(repository.declineSignup).toHaveBeenCalledWith(
      { discordId: signup.discordId, encounter: signup.encounter },
      user.username,
    );
    expect(
      declineReasonRequestService.requestDeclineReason,
    ).toHaveBeenCalledWith(
      {
        ...signup,
        reviewedBy: user.username,
        status: SignupStatus.DECLINED,
      },
      user,
      messageReaction.message,
    );
  });
});
