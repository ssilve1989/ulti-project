import { Test } from '@nestjs/testing';
import { PartyStatus, type SignupDocument } from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { ReviewDmFlowService } from '../review-dm-flow.service.js';
import { RequestApprovalCommentEventHandler } from './request-approval-comment.event-handler.js';
import { SignupApprovalCommentNotifier } from './signup-approval-comment.notifier.js';

describe('RequestApprovalCommentEventHandler', () => {
  let handler: RequestApprovalCommentEventHandler;
  let reviewDmFlowService: Mocked<ReviewDmFlowService>;
  let signupCollection: Mocked<SignupCollection>;
  let notifier: Mocked<SignupApprovalCommentNotifier>;
  let signup: SignupDocument;
  let reviewer: User;
  let message: Message<true>;

  const event = (
    kind: 'approval' | 'edit',
    over: Partial<SignupDocument> = {},
  ) =>
    new SignupApprovedEvent(
      { ...signup, ...over },
      mockOf<SettingsDocument>({}),
      reviewer,
      message,
      kind,
    );

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RequestApprovalCommentEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(RequestApprovalCommentEventHandler);
    reviewDmFlowService = fixture.get(ReviewDmFlowService);
    signupCollection = fixture.get(SignupCollection);
    notifier = fixture.get(SignupApprovalCommentNotifier);

    signup = partialMock<SignupDocument>({
      discordId: 'user-1',
      encounter: 'DSR',
    });
    reviewer = mockOf<User>({ id: 'reviewer-1' });
    message = mockOf<Message<true>>({ id: 'review-message', embeds: [{}] });

    vi.spyOn(handler['logger'], 'error').mockImplementation(() => undefined);
  });

  it('does nothing for an /edit-signup re-approval', async () => {
    await handler.handle(event('edit'));

    expect(reviewDmFlowService.collectApprovalComment).not.toHaveBeenCalled();
    expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('persists the comment and DMs the user when the reviewer adds one', async () => {
    reviewDmFlowService.collectApprovalComment.mockResolvedValue(
      'great logs, welcome!',
    );

    await handler.handle(event('approval'));

    expect(reviewDmFlowService.collectApprovalComment).toHaveBeenCalledWith(
      expect.objectContaining({ discordId: 'user-1' }),
      reviewer,
    );
    expect(signupCollection.updateApprovalComment).toHaveBeenCalledWith(
      { discordId: 'user-1', encounter: 'DSR' },
      'great logs, welcome!',
    );
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ discordId: 'user-1' }),
      message,
      'great logs, welcome!',
    );
  });

  it('does nothing further when no comment was collected', async () => {
    reviewDmFlowService.collectApprovalComment.mockResolvedValue(undefined);

    await handler.handle(event('approval'));

    expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('skips the write for a cleared signup but still DMs the comment', async () => {
    reviewDmFlowService.collectApprovalComment.mockResolvedValue('gg');

    await handler.handle(
      event('approval', { partyStatus: PartyStatus.Cleared }),
    );

    expect(signupCollection.updateApprovalComment).not.toHaveBeenCalled();
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ partyStatus: PartyStatus.Cleared }),
      message,
      'gg',
    );
  });

  it('still DMs the comment when the standalone write fails', async () => {
    reviewDmFlowService.collectApprovalComment.mockResolvedValue('welcome');
    signupCollection.updateApprovalComment.mockRejectedValue(
      new Error('firestore down'),
    );

    await expect(handler.handle(event('approval'))).resolves.toBeUndefined();

    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({ discordId: 'user-1' }),
      message,
      'welcome',
    );
  });

  it('does not throw when the collection flow itself fails', async () => {
    reviewDmFlowService.collectApprovalComment.mockRejectedValue(
      new Error('collector blew up'),
    );

    await expect(handler.handle(event('approval'))).resolves.toBeUndefined();

    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
