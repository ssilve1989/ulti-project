import { Test } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupDeclinedEvent } from '../events/signup.events.js';
import { ReviewDmFlowService } from '../review-dm-flow.service.js';
import { RequestDeclineReasonEventHandler } from './request-decline-reason.event-handler.js';
import { SignupDeclineReasonNotifier } from './signup-decline-reason.notifier.js';

describe('RequestDeclineReasonEventHandler', () => {
  let handler: RequestDeclineReasonEventHandler;
  let reviewDmFlowService: Mocked<ReviewDmFlowService>;
  let signupCollection: Mocked<SignupCollection>;
  let notifier: Mocked<SignupDeclineReasonNotifier>;
  let signup: SignupDocument;
  let reviewer: User;
  let message: Message<true>;

  const event = (kind: 'decline' | 'edit') =>
    new SignupDeclinedEvent(signup, reviewer, message, kind);

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RequestDeclineReasonEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(RequestDeclineReasonEventHandler);
    reviewDmFlowService = fixture.get(ReviewDmFlowService);
    signupCollection = fixture.get(SignupCollection);
    notifier = fixture.get(SignupDeclineReasonNotifier);

    signup = partialMock<SignupDocument>({
      discordId: 'user-1',
      encounter: 'DSR',
    });
    reviewer = mockOf<User>({ id: 'reviewer-1' });
    message = mockOf<Message<true>>({ id: 'review-message' });

    vi.spyOn(handler['logger'], 'error').mockImplementation(() => undefined);
  });

  it('does nothing for an /edit-signup re-decline', async () => {
    await handler.handle(event('edit'));

    expect(reviewDmFlowService.collectDeclineReason).not.toHaveBeenCalled();
    expect(signupCollection.updateDeclineReason).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('persists the reason and DMs the user when the reviewer gives one', async () => {
    reviewDmFlowService.collectDeclineReason.mockResolvedValue(
      'Not enough logs',
    );

    await handler.handle(event('decline'));

    expect(reviewDmFlowService.collectDeclineReason).toHaveBeenCalledWith(
      signup,
      reviewer,
    );
    expect(signupCollection.updateDeclineReason).toHaveBeenCalledWith(
      { discordId: 'user-1', encounter: 'DSR' },
      'Not enough logs',
    );
    expect(notifier.notify).toHaveBeenCalledWith(
      signup,
      message,
      'Not enough logs',
    );
  });

  it('skips the write but still DMs the generic denial when no reason was given', async () => {
    reviewDmFlowService.collectDeclineReason.mockResolvedValue(undefined);

    await handler.handle(event('decline'));

    expect(signupCollection.updateDeclineReason).not.toHaveBeenCalled();
    expect(notifier.notify).toHaveBeenCalledWith(signup, message, undefined);
  });

  it('still DMs the reason when the standalone write fails', async () => {
    reviewDmFlowService.collectDeclineReason.mockResolvedValue('too fresh');
    signupCollection.updateDeclineReason.mockRejectedValue(
      new Error('firestore down'),
    );

    await expect(handler.handle(event('decline'))).resolves.toBeUndefined();

    expect(notifier.notify).toHaveBeenCalledWith(signup, message, 'too fresh');
  });

  it('does not throw when the collection flow itself fails', async () => {
    reviewDmFlowService.collectDeclineReason.mockRejectedValue(
      new Error('collector blew up'),
    );

    await expect(handler.handle(event('decline'))).resolves.toBeUndefined();

    expect(notifier.notify).not.toHaveBeenCalled();
  });
});
