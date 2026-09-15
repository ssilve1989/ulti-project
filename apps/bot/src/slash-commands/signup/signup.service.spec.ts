import { EventEmitter } from 'node:events';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PartyStatus,
  type ReviewHistoryEntry,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import {
  type Client,
  Events,
  type Message,
  type MessageReaction,
  type ReactionEmoji,
  type User,
} from 'discord.js';
import { Timestamp, type WriteResult } from 'firebase-admin/firestore';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';
import { DiscordService } from '../../discord/discord.service.js';
import { EncountersService } from '../../encounters/encounters.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
  withInternals,
} from '../../test-utils/mock-factory.js';
import { ApprovalDecisionRequestService } from './approval-decision-request.service.js';
import { SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';
import { SignupService } from './signup.service.js';

// TODO: Actually assert approval/decline functionality, not just that they were called
describe('SignupService', () => {
  let service: SignupService;
  let fixture: TestingModule;
  let messageReaction: MessageReaction;
  let user: User;
  let settings: SettingsDocument;
  let signup: SignupDocument;
  let repository: Mocked<SignupCollection>;
  let discordService: Mocked<DiscordService>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    fixture = await Test.createTestingModule({
      providers: [SignupService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(SignupService);
    repository = fixture.get(SignupCollection);
    discordService = fixture.get(DiscordService);
    errorService = fixture.get(ErrorService);

    messageReaction = mockOf<MessageReaction>({
      message: mockOf<Message<boolean>>({
        id: 'messageId',
        edit: vi.fn().mockResolvedValue(undefined),
        inGuild: vi.fn().mockReturnValue(true),
        embeds: [{}],
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

  it('should handle a declined reaction', async () => {
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.DECLINED;

    repository.findByReviewId.mockResolvedValueOnce(signup);
    discordService.getDisplayName.mockResolvedValueOnce('someuser');
    repository.updateSignupStatus.mockResolvedValueOnce(
      mockOf<WriteResult>({}),
    );
    vi.spyOn(messageReaction.message, 'edit').mockResolvedValueOnce(
      mockOf<Awaited<ReturnType<(typeof messageReaction.message)['edit']>>>({}),
    );

    const handleDeclineSpy = vi.spyOn(
      withInternals<{
        handleApprovedReaction: (...args: unknown[]) => Promise<unknown>;
        handleDeclinedReaction: (...args: unknown[]) => Promise<unknown>;
      }>(service),
      'handleDeclinedReaction',
    );

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

  it('threads the collected comment onto SignupApprovedEvent without persisting it', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'approved',
      progPoint: 'point-a',
      comment: 'Nice work!',
    });

    const event = await service['handleApprovedReaction'](
      signup,
      messageReaction.message,
      user,
      settings,
    );

    if (!event) {
      throw new Error('expected an event for a decided approval');
    }

    expect(event.comment).toBe('Nice work!');
    expect(event.signup).not.toHaveProperty('comment');
    expect(repository.updateSignupStatus).toHaveBeenCalledWith(
      SignupStatus.APPROVED,
      expect.not.objectContaining({ comment: expect.anything() }),
      user.username,
      expect.any(Array),
    );
  });

  it('reverts the reaction and persists nothing when the reviewer cancels the approval', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'cancelled',
    });

    const approvedRemove = vi.fn().mockResolvedValue(undefined);
    const message = mockOf<Message<true>>({
      inGuild: () => true,
      embeds: [{}],
      reactions: {
        cache: {
          get: (key: string) =>
            key === SIGNUP_REVIEW_REACTIONS.APPROVED
              ? { users: { remove: approvedRemove } }
              : undefined,
        },
      },
    });

    const event = await service['handleApprovedReaction'](
      signup,
      message,
      user,
      settings,
    );

    expect(event).toBeUndefined();
    expect(approvedRemove).toHaveBeenCalledWith(user.id);
    expect(repository.updateSignupStatus).not.toHaveBeenCalled();
    expect(errorService.captureError).not.toHaveBeenCalled();
    expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('reports but does not DM when reverting the reaction fails after a cancelled approval', async () => {
    repository.findByReviewId.mockResolvedValue(signup);
    messageReaction.emoji.name = SIGNUP_REVIEW_REACTIONS.APPROVED;

    const approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService> =
      fixture.get(ApprovalDecisionRequestService);
    approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
      type: 'cancelled',
    });

    const revertError = new Error('Missing Permissions');
    const message = mockOf<Message<true>>({
      inGuild: () => true,
      embeds: [{}],
      reactions: {
        cache: {
          get: (key: string) =>
            key === SIGNUP_REVIEW_REACTIONS.APPROVED
              ? { users: { remove: vi.fn().mockRejectedValue(revertError) } }
              : undefined,
        },
      },
    });

    const event = await service['handleApprovedReaction'](
      signup,
      message,
      user,
      settings,
    );

    expect(event).toBeUndefined();
    expect(errorService.captureError).toHaveBeenCalledWith(revertError);
    expect(discordService.sendDirectMessage).not.toHaveBeenCalled();
  });

  describe('review history', () => {
    let encountersService: Mocked<EncountersService>;
    let approvalDecisionRequestService: Mocked<ApprovalDecisionRequestService>;

    const reviewMessage = () =>
      mockOf<Message<true>>({ inGuild: () => true, embeds: [{}] });

    beforeEach(() => {
      encountersService = fixture.get(EncountersService);
      approvalDecisionRequestService = fixture.get(
        ApprovalDecisionRequestService,
      );
      user = mockOf<User>({ id: 'reviewer-1', username: 'spike' });
    });

    it('appends an approved entry seeded with the previous approval', async () => {
      const previouslyApproved = partialMock<SignupDocument>({
        discordId: 'abc123',
        reviewMessageId: 'messageId',
        progPoint: 'old-point',
        partyStatus: PartyStatus.ClearParty,
      });
      approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
        type: 'approved',
        progPoint: 'point-a',
      });
      encountersService.getPartyStatusForProgPoint.mockResolvedValue(
        PartyStatus.ProgParty,
      );

      const event = await service['handleApprovedReaction'](
        previouslyApproved,
        reviewMessage(),
        user,
        settings,
      );

      const appended = [
        {
          type: 'trackingStarted',
          progPoint: 'old-point',
          partyStatus: PartyStatus.ClearParty,
          at: expect.any(Timestamp),
        },
        {
          type: 'approved',
          progPoint: 'point-a',
          partyStatus: PartyStatus.ProgParty,
          actorId: 'reviewer-1',
          at: expect.any(Timestamp),
          via: 'reaction',
        },
      ];
      expect(repository.updateSignupStatus).toHaveBeenCalledWith(
        SignupStatus.APPROVED,
        expect.objectContaining({
          progPoint: 'point-a',
          partyStatus: PartyStatus.ProgParty,
        }),
        'spike',
        appended,
      );
      // the event carries the very entries written, so handlers can match
      // the stored decision by its `at`
      expect(event?.signup.reviewHistory).toEqual(appended);
      expect(event?.signup.reviewHistory).toEqual(
        repository.updateSignupStatus.mock.calls[0][3],
      );
    });

    it('appends only the approved entry when history already exists', async () => {
      const existing: ReviewHistoryEntry = {
        type: 'trackingStarted',
        at: Timestamp.fromMillis(1_000),
      };
      const tracked = partialMock<SignupDocument>({
        discordId: 'abc123',
        reviewHistory: [existing],
      });
      approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
        type: 'approved',
        progPoint: 'point-a',
      });
      encountersService.getPartyStatusForProgPoint.mockResolvedValue(
        PartyStatus.ProgParty,
      );

      const event = await service['handleApprovedReaction'](
        tracked,
        reviewMessage(),
        user,
        settings,
      );

      expect(repository.updateSignupStatus).toHaveBeenCalledWith(
        SignupStatus.APPROVED,
        expect.anything(),
        'spike',
        [expect.objectContaining({ type: 'approved', actorId: 'reviewer-1' })],
      );
      expect(event?.signup.reviewHistory).toEqual([
        existing,
        expect.objectContaining({ type: 'approved', actorId: 'reviewer-1' }),
      ]);
    });

    it('publishes the approved signup without the previous announcement id', async () => {
      const previouslyAnnounced = partialMock<SignupDocument>({
        discordId: 'abc123',
        approvalMessageId: 'old-announcement',
        reviewHistory: [],
      });
      approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
        type: 'approved',
        progPoint: 'point-a',
      });
      encountersService.getPartyStatusForProgPoint.mockResolvedValue(
        PartyStatus.ProgParty,
      );

      const event = await service['handleApprovedReaction'](
        previouslyAnnounced,
        reviewMessage(),
        user,
        settings,
      );

      if (!event) {
        throw new Error('expected an event for a decided approval');
      }

      expect(event.signup).toHaveProperty('approvalMessageId', undefined);
    });

    it('writes no history for a cleared approval', async () => {
      approvalDecisionRequestService.requestApprovalDecision.mockResolvedValue({
        type: 'approved',
        progPoint: PartyStatus.Cleared,
      });

      await service['handleApprovedReaction'](
        signup,
        reviewMessage(),
        user,
        settings,
      );

      expect(repository.removeSignup).toHaveBeenCalled();
      expect(repository.updateSignupStatus).not.toHaveBeenCalled();
    });

    it('appends a declined entry on decline', async () => {
      await service['handleDeclinedReaction'](signup, reviewMessage(), user);

      expect(repository.updateSignupStatus).toHaveBeenCalledWith(
        SignupStatus.DECLINED,
        signup,
        'spike',
        [
          { type: 'trackingStarted', at: expect.any(Timestamp) },
          {
            type: 'declined',
            actorId: 'reviewer-1',
            at: expect.any(Timestamp),
            via: 'reaction',
          },
        ],
      );
    });
  });

  describe('handleError', () => {
    const buildMessageWithReactions = (
      approvedRemove: ReturnType<typeof vi.fn>,
      declinedRemove: ReturnType<typeof vi.fn>,
    ) =>
      mockOf<Message<boolean>>({
        reactions: {
          cache: {
            get: (key: string) => {
              if (key === SIGNUP_REVIEW_REACTIONS.APPROVED) {
                return { users: { remove: approvedRemove } };
              }
              if (key === SIGNUP_REVIEW_REACTIONS.DECLINED) {
                return { users: { remove: declinedRemove } };
              }
              return undefined;
            },
          },
        },
      });

    it('reverts both reactions, DMs the reviewer, and captures the error', async () => {
      const approvedRemove = vi.fn().mockResolvedValue(undefined);
      const declinedRemove = vi.fn().mockResolvedValue(undefined);
      const message = buildMessageWithReactions(approvedRemove, declinedRemove);
      const error = new Error('boom');

      await service['handleError'](error, user, message);

      expect(approvedRemove).toHaveBeenCalledWith(user.id);
      expect(declinedRemove).toHaveBeenCalledWith(user.id);
      expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
      );
      expect(errorService.captureError).toHaveBeenCalledWith(error);
    });
  });

  describe('onApplicationBootstrap', () => {
    afterEach(() => {
      service.onModuleDestroy();
      vi.useRealTimers();
    });

    const emitReaction = (emitter: EventEmitter, messageId: string) => {
      emitter.emit(
        Events.MessageReactionAdd,
        mockOf<MessageReaction>({
          message: mockOf<Message<boolean>>({ id: messageId }),
        }),
        user,
      );
    };

    it('keeps serializing reactions for the same message across the approval decision window', async () => {
      const emitter = new EventEmitter();
      // `client` is declared `readonly` on DiscordService; defineProperty
      // bypasses that (the auto-mock proxy's `defineProperty` trap stores it)
      // without a type assertion.
      Object.defineProperty(discordService, 'client', {
        value: mockOf<Client>(emitter),
        configurable: true,
      });

      let resolveFirst: () => void = () => {};
      const firstProcessEvent = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      const processEventSpy = vi
        .spyOn(
          withInternals<{
            processEvent: (event: unknown) => Promise<void>;
          }>(service),
          'processEvent',
        )
        .mockImplementationOnce(() => firstProcessEvent)
        .mockResolvedValue(undefined);

      vi.useFakeTimers();

      service.onApplicationBootstrap();

      emitReaction(emitter, 'review-1');
      expect(processEventSpy).toHaveBeenCalledTimes(1);

      // Past the old 30s group duration, but well inside the up-to-5-minute
      // approval decision window the first reaction is still awaiting.
      await vi.advanceTimersByTimeAsync(60_000);

      emitReaction(emitter, 'review-1');
      // The group must still be alive and serializing via concatMap: the
      // second reaction should NOT start a new, concurrent processEvent call
      // while the first is still pending.
      expect(processEventSpy).toHaveBeenCalledTimes(1);

      resolveFirst();
      await vi.advanceTimersByTimeAsync(0);

      expect(processEventSpy).toHaveBeenCalledTimes(2);
    });
  });
});
