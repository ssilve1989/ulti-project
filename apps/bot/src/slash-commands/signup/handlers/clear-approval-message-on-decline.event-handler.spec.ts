import { Test } from '@nestjs/testing';
import { Encounter, type SignupDocument } from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupDeclinedEvent } from '../events/signup.events.js';
import { ClearApprovalMessageOnDeclineEventHandler } from './clear-approval-message-on-decline.event-handler.js';

describe('ClearApprovalMessageOnDeclineEventHandler', () => {
  let handler: ClearApprovalMessageOnDeclineEventHandler;
  let discordService: Mocked<DiscordService>;
  let settingsCollection: Mocked<SettingsCollection>;
  let signupCollection: Mocked<SignupCollection>;

  const guildId = 'guild-1';
  const signupChannel = 'signup-channel';

  const reviewedBy = mockOf<User>({ id: 'reviewer-1' });

  const settingsWithChannel = partialMock<SettingsDocument>({ signupChannel });

  const createEvent = (signup: Partial<SignupDocument>) =>
    new SignupDeclinedEvent(
      partialMock<SignupDocument>({
        discordId: 'user-1',
        encounter: Encounter.TOP,
        ...signup,
      }),
      reviewedBy,
      mockOf<Message<true>>({ guildId }),
    );

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ClearApprovalMessageOnDeclineEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(ClearApprovalMessageOnDeclineEventHandler);
    discordService = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    signupCollection = fixture.get(SignupCollection);
  });

  it('deletes the stale approval post and clears the field when the message still exists', async () => {
    settingsCollection.getSettings.mockResolvedValue(settingsWithChannel);
    const existing = mockOf<Message<true>>({
      delete: vi.fn().mockResolvedValue(undefined),
    });
    discordService.fetchMessage.mockResolvedValue(existing);

    const event = createEvent({ approvalMessageId: 'approval-message-id' });
    await handler.handle(event);

    expect(discordService.fetchMessage).toHaveBeenCalledWith(
      guildId,
      signupChannel,
      'approval-message-id',
    );
    expect(existing.delete).toHaveBeenCalledTimes(1);
    expect(signupCollection.clearApprovalMessageId).toHaveBeenCalledWith(
      event.signup,
    );
  });

  it('still clears the field when the approval post is already gone', async () => {
    settingsCollection.getSettings.mockResolvedValue(settingsWithChannel);
    discordService.fetchMessage.mockResolvedValue(undefined);

    const event = createEvent({ approvalMessageId: 'approval-message-id' });
    await expect(handler.handle(event)).resolves.toBeUndefined();

    expect(discordService.fetchMessage).toHaveBeenCalled();
    expect(signupCollection.clearApprovalMessageId).toHaveBeenCalledWith(
      event.signup,
    );
  });

  it('does nothing when the signup carries no approvalMessageId', async () => {
    const event = createEvent({});
    await handler.handle(event);

    expect(settingsCollection.getSettings).not.toHaveBeenCalled();
    expect(discordService.fetchMessage).not.toHaveBeenCalled();
    expect(signupCollection.clearApprovalMessageId).not.toHaveBeenCalled();
  });

  it('clears the field without fetching when no signup channel is configured', async () => {
    settingsCollection.getSettings.mockResolvedValue(
      partialMock<SettingsDocument>({}),
    );

    const event = createEvent({ approvalMessageId: 'approval-message-id' });
    await handler.handle(event);

    expect(discordService.fetchMessage).not.toHaveBeenCalled();
    expect(signupCollection.clearApprovalMessageId).toHaveBeenCalledWith(
      event.signup,
    );
  });

  it('swallows unexpected errors raised while fetching the message', async () => {
    settingsCollection.getSettings.mockResolvedValue(settingsWithChannel);
    discordService.fetchMessage.mockRejectedValue(new Error('boom'));

    const event = createEvent({ approvalMessageId: 'approval-message-id' });
    await expect(handler.handle(event)).resolves.toBeUndefined();

    expect(signupCollection.clearApprovalMessageId).not.toHaveBeenCalled();
  });
});
