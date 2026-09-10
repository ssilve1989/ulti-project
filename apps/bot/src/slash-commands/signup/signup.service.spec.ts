import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type { Message, MessageReaction, ReactionEmoji, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
  withInternals,
} from '../../test-utils/mock-factory.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from './events/signup.events.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';
import { SignupMutationService } from './signup-mutation.service.js';

// TODO: Actually assert approval/decline functionality, not just that they were called
describe('SignupService', () => {
  let service: SignupService;
  let messageReaction: MessageReaction;
  let user: User;
  let settings: SettingsDocument;
  let signup: SignupDocument;
  let repository: Mocked<SignupCollection>;
  let discordService: Mocked<DiscordService>;
  let mutationService: Mocked<SignupMutationService>;
  let eventBus: Mocked<EventBus>;

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [SignupService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(SignupService);
    repository = fixture.get(SignupCollection);
    discordService = fixture.get(DiscordService);
    mutationService = fixture.get(SignupMutationService);
    eventBus = fixture.get(EventBus);

    messageReaction = mockOf<MessageReaction>({
      message: mockOf<Message<boolean>>({
        id: 'messageId',
        edit: vi.fn().mockResolvedValue(undefined),
        inGuild: vi.fn().mockReturnValue(true),
      }),
      emoji: mockOf<ReactionEmoji>({
        name: 'emojiName',
      }),
    });

    user = mockOf<User>({
      id: 'userId',
      displayAvatarURL: () => 'http://someurl.com',
      toString: () => '<@someuser>',
    });
    settings = partialMock<SettingsDocument>({});
    signup = partialMock<SignupDocument>({
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
      .spyOn(
        withInternals<{
          handleApprovedReaction: (...args: unknown[]) => Promise<unknown>;
          handleDeclinedReaction: (...args: unknown[]) => Promise<unknown>;
        }>(service),
        'handleApprovedReaction',
      )
      .mockResolvedValue({});

    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).toHaveBeenCalledWith(
      signup,
      messageReaction.message,
      user,
      settings,
    );
  });

  it('delegates approval persistence to the mutation service and publishes an approved event', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const confirmedSignup = partialMock<SignupDocument>({
      ...signup,
      progPoint: 'p3-thordan',
    });

    vi.spyOn(
      withInternals<{
        confirmProgPoint: (...args: unknown[]) => Promise<string | undefined>;
      }>(service),
      'confirmProgPoint',
    ).mockResolvedValue('p3-thordan');
    mutationService.buildConfirmedSignup.mockResolvedValue(confirmedSignup);

    await service['handleReaction'](messageReaction, user, settings);

    expect(mutationService.buildConfirmedSignup).toHaveBeenCalledWith(
      signup,
      'p3-thordan',
    );
    expect(mutationService.applyApproval).toHaveBeenCalledWith(
      confirmedSignup,
      settings,
      user,
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SignupApprovedEvent),
    );
  });

  it('persists the approval before publishing the event, and does not collect a comment inline', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    vi.spyOn(
      withInternals<{
        confirmProgPoint: (...args: unknown[]) => Promise<string | undefined>;
      }>(service),
      'confirmProgPoint',
    ).mockResolvedValue('p3-thordan');
    mutationService.buildConfirmedSignup.mockResolvedValue(signup);

    await service['handleReaction'](messageReaction, user, settings);

    // The approval-comment DM is a detached side-effect off SignupApprovedEvent,
    // not run inline here.
    const persistedAt =
      mutationService.applyApproval.mock.invocationCallOrder[0];
    const publishedAt = eventBus.publish.mock.invocationCallOrder[0];
    expect(persistedAt).toBeLessThan(publishedAt);
  });

  it('aborts the approval without persisting when prog-point confirmation fails', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    vi.spyOn(
      withInternals<{
        confirmProgPoint: (...args: unknown[]) => Promise<string | undefined>;
      }>(service),
      'confirmProgPoint',
    ).mockRejectedValue(new Error('prog point timed out'));

    await expect(
      service['handleReaction'](messageReaction, user, settings),
    ).rejects.toThrow('prog point timed out');

    expect(mutationService.applyApproval).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('persists the decline and publishes SignupDeclinedEvent before any reason collection', async () => {
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.DECLINED;

    repository.findByReviewId.mockResolvedValueOnce(signup);
    discordService.getDisplayName.mockResolvedValueOnce('someuser');
    vi.spyOn(messageReaction.message, 'edit').mockResolvedValueOnce(
      mockOf<Awaited<ReturnType<(typeof messageReaction.message)['edit']>>>({}),
    );

    await service['handleReaction'](messageReaction, user, settings);

    expect(mutationService.applyDecline).toHaveBeenCalledWith(signup, user);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SignupDeclinedEvent),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'decline' }),
    );

    const persistedAt =
      mutationService.applyDecline.mock.invocationCallOrder[0];
    const publishedAt = eventBus.publish.mock.invocationCallOrder[0];
    expect(persistedAt).toBeLessThan(publishedAt);
  });

  it('should return early if a signup has been reviewed', async () => {
    repository.findByReviewId.mockResolvedValue({
      ...signup,
      reviewedBy: user.id,
    });

    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const spy = vi.spyOn(
      withInternals<{
        handleApprovedReaction: (...args: unknown[]) => Promise<unknown>;
        handleDeclinedReaction: (...args: unknown[]) => Promise<unknown>;
      }>(service),
      'handleApprovedReaction',
    );
    await service['handleReaction'](messageReaction, user, settings);

    expect(spy).not.toHaveBeenCalled();
  });
});
