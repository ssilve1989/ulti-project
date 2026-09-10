import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { SendApprovedMessageEventHandler } from './send-approved-message.event-handler.js';

describe('SendApprovedMessageEventHandler', () => {
  let handler: SendApprovedMessageEventHandler;
  let discordService: Mocked<DiscordService>;
  let repository: Mocked<SignupCollection>;

  const guildId = 'guild-1';
  const sentMessageId = 'sent-message-id';

  type MockTextChannel = NonNullable<
    Awaited<ReturnType<DiscordService['getTextChannel']>>
  >;

  const reviewedBy = mockOf<User>({
    id: 'approver-1',
    displayAvatarURL: () => 'http://avatar.png',
  });

  const createEvent = (
    signup: Partial<SignupDocument>,
    kind: 'approval' | 'edit' = 'approval',
  ) =>
    new SignupApprovedEvent(
      partialMock<SignupDocument>({
        discordId: 'user-1',
        encounter: Encounter.TOP,
        character: 'Char Name',
        world: 'Coeurl',
        role: 'Tank',
        progPointRequested: 'P1',
        ...signup,
      }),
      partialMock<SettingsDocument>({ signupChannel: 'signup-channel' }),
      reviewedBy,
      mockOf<Message<true>>({ guildId }),
      kind,
    );

  let channel: MockTextChannel;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SendApprovedMessageEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(SendApprovedMessageEventHandler);
    discordService = fixture.get(DiscordService);
    repository = fixture.get(SignupCollection);

    channel = mockOf<MockTextChannel>({
      send: vi
        .fn()
        .mockResolvedValue(mockOf<Message<true>>({ id: sentMessageId })),
    });

    discordService.getTextChannel.mockResolvedValue(channel);
  });

  it('sends the announcement and persists the approval message id for a normal signup', async () => {
    const event = createEvent({ partyStatus: PartyStatus.ProgParty });

    await handler.handle(event);

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(repository.setApprovalMessageId).toHaveBeenCalledWith(
      event.signup,
      sentMessageId,
    );
  });

  it('edits the existing announcement in place when an edit resolves a message from approvalMessageId', async () => {
    const existing = mockOf<Message<true>>({
      edit: vi.fn().mockResolvedValue(undefined),
    });
    discordService.fetchMessage.mockResolvedValue(existing);

    const event = createEvent(
      {
        partyStatus: PartyStatus.ProgParty,
        approvalMessageId: 'existing-message-id',
      },
      'edit',
    );

    await handler.handle(event);

    expect(discordService.fetchMessage).toHaveBeenCalledWith(
      guildId,
      'signup-channel',
      'existing-message-id',
    );
    expect(existing.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('user-1'),
        embeds: [expect.anything()],
      }),
    );
    expect(channel.send).not.toHaveBeenCalled();
    expect(repository.setApprovalMessageId).not.toHaveBeenCalled();
  });

  it('posts a new announcement when an edit points at a deleted message', async () => {
    discordService.fetchMessage.mockResolvedValue(undefined);

    const event = createEvent(
      {
        partyStatus: PartyStatus.ProgParty,
        approvalMessageId: 'deleted-message-id',
      },
      'edit',
    );

    await handler.handle(event);

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(repository.setApprovalMessageId).toHaveBeenCalledWith(
      event.signup,
      sentMessageId,
    );
  });

  it('posts a fresh announcement for a plain approval even when a stale approvalMessageId is present', async () => {
    const event = createEvent(
      {
        partyStatus: PartyStatus.ProgParty,
        approvalMessageId: 'stale-message-id',
      },
      'approval',
    );

    await handler.handle(event);

    expect(discordService.fetchMessage).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(repository.setApprovalMessageId).toHaveBeenCalledWith(
      event.signup,
      sentMessageId,
    );
  });

  it('does not persist the approval message id when the signup has cleared', async () => {
    discordService.getEmojis.mockResolvedValue([]);

    const event = createEvent({
      partyStatus: PartyStatus.Cleared,
      progPoint: PartyStatus.Cleared,
    });

    await handler.handle(event);

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(repository.setApprovalMessageId).not.toHaveBeenCalled();
    expect(discordService.getEmojis).toHaveBeenCalled();
  });
});
