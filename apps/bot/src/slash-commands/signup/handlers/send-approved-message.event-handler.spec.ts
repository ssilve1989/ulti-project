import { Test, type TestingModule } from '@nestjs/testing';
import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  type ReviewHistoryEntry,
  type SignupDocument,
} from '@ulti-project/shared';
import { Colors, type GuildMember, type Message, type User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  type DeepPartial,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { SendApprovedMessageEventHandler } from './send-approved-message.event-handler.js';

describe('SendApprovedMessageEventHandler', () => {
  let fixture: TestingModule;
  let handler: SendApprovedMessageEventHandler;
  let discordService: Mocked<DiscordService>;
  let repository: Mocked<SignupCollection>;
  let channelSend: ReturnType<typeof vi.fn>;

  const approver = mockOf<User>({
    id: 'reviewer-1',
    displayAvatarURL: () => 'https://cdn.example/reviewer.png',
  });
  const reviewMessage = mockOf<Message<true>>({ guildId: 'guild-1' });
  const settings = partialMock<SettingsDocument>({
    signupChannel: 'signup-channel',
  });

  const buildSignup = (overrides: DeepPartial<SignupDocument> = {}) =>
    partialMock<SignupDocument>({
      discordId: 'applicant-1',
      encounter: Encounter.DSR,
      character: 'faye valentine',
      world: 'gilgamesh',
      role: 'WHM',
      progPoint: 'P2',
      progPointRequested: 'P3',
      partyStatus: PartyStatus.ProgParty,
      proofOfProgLink: 'https://www.fflogs.com/reports/abc',
      screenshot: 'https://cdn.example/shot.png',
      ...overrides,
    });

  const currentApprovalAt = Timestamp.fromMillis(2_000);
  const reviewHistory: ReviewHistoryEntry[] = [
    {
      type: 'approved',
      progPoint: 'P1',
      partyStatus: PartyStatus.EarlyProgParty,
      actorId: 'reviewer-0',
      at: Timestamp.fromMillis(1_000),
      via: 'reaction',
    },
    {
      type: 'declined',
      actorId: 'reviewer-1',
      at: Timestamp.fromMillis(1_500),
      via: 'reaction',
    },
    {
      type: 'approved',
      progPoint: 'P2',
      partyStatus: PartyStatus.ProgParty,
      actorId: 'reviewer-1',
      at: currentApprovalAt,
      via: 'reaction',
    },
  ];

  const baseFields = (progPoint: string) => [
    { name: 'Character', value: 'Faye Valentine', inline: true },
    { name: 'World', value: 'Gilgamesh', inline: true },
    { name: 'Job', value: 'WHM', inline: true },
    { name: 'Prog Point', value: progPoint, inline: true },
    { name: '​', value: '​', inline: true },
  ];

  beforeEach(async () => {
    fixture = await Test.createTestingModule({
      providers: [SendApprovedMessageEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(SendApprovedMessageEventHandler);
    discordService = fixture.get(DiscordService);
    repository = fixture.get(SignupCollection);

    channelSend = vi
      .fn()
      .mockResolvedValue(mockOf<Message>({ id: 'announcement-1' }));
    discordService.getTextChannel.mockResolvedValue(
      mockOf<
        NonNullable<Awaited<ReturnType<DiscordService['getTextChannel']>>>
      >({ send: channelSend }),
    );
    discordService.getDisplayName.mockResolvedValue('Spike');
    discordService.getGuildMember.mockResolvedValue(
      mockOf<GuildMember>({
        displayAvatarURL: () => 'https://cdn.example/applicant.png',
      }),
    );
    discordService.getEmojiString.mockReturnValue('');
    discordService.getEmojis.mockReturnValue([]);
    repository.setApprovalMessageId.mockResolvedValue({ type: 'written' });
  });

  it('posts the approval announcement', async () => {
    await handler.handle(
      new SignupApprovedEvent(buildSignup(), settings, approver, reviewMessage),
    );

    expect(channelSend).toHaveBeenCalledWith({
      content: '<@applicant-1> Signup Approved!',
      embeds: [
        expect.objectContaining({
          data: {
            title: `Signup Approved - ${EncounterFriendlyDescription[Encounter.DSR]}`,
            fields: [
              ...baseFields('P2'),
              {
                name: 'Prog Proof Link',
                value: '[View](https://www.fflogs.com/reports/abc)',
                inline: true,
              },
            ],
            footer: {
              text: 'Approved by Spike',
              icon_url: 'https://cdn.example/reviewer.png',
            },
            color: Colors.Green,
            timestamp: expect.any(String),
            image: { url: 'https://cdn.example/shot.png' },
            thumbnail: { url: 'https://cdn.example/applicant.png' },
          },
        }),
      ],
    });
  });

  it('posts the congratulations announcement for a cleared signup', async () => {
    const cleared = buildSignup({
      partyStatus: PartyStatus.Cleared,
      progPoint: PartyStatus.Cleared,
      proofOfProgLink: null,
      screenshot: null,
    });

    await handler.handle(
      new SignupApprovedEvent(cleared, settings, approver, reviewMessage),
    );

    expect(channelSend).toHaveBeenCalledWith({
      content: `<@applicant-1> Congratulations on clearing **${EncounterFriendlyDescription[Encounter.DSR]}**!`,
      embeds: [
        expect.objectContaining({
          data: {
            title: 'Congratulations!',
            fields: baseFields(PartyStatus.Cleared),
            footer: {
              text: 'Approved by Spike',
              icon_url: 'https://cdn.example/reviewer.png',
            },
            color: Colors.Green,
            timestamp: expect.any(String),
            thumbnail: { url: 'https://cdn.example/applicant.png' },
          },
        }),
      ],
    });
  });

  it('stores the announcement message id against the current approval decision', async () => {
    const signup = buildSignup({ reviewHistory });

    await handler.handle(
      new SignupApprovedEvent(signup, settings, approver, reviewMessage),
    );

    expect(repository.setApprovalMessageId).toHaveBeenCalledWith(
      signup,
      'announcement-1',
      currentApprovalAt,
    );
  });

  it('posts a fresh announcement even when an old approvalMessageId is stored', async () => {
    const signup = buildSignup({
      approvalMessageId: 'old-announcement',
      reviewHistory,
    });

    await handler.handle(
      new SignupApprovedEvent(signup, settings, approver, reviewMessage),
    );

    expect(discordService.fetchMessage).not.toHaveBeenCalled();
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(repository.setApprovalMessageId).toHaveBeenCalledWith(
      signup,
      'announcement-1',
      currentApprovalAt,
    );
  });

  it('does not store a message id when the signup has no approval decision', async () => {
    await handler.handle(
      new SignupApprovedEvent(buildSignup(), settings, approver, reviewMessage),
    );

    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(repository.setApprovalMessageId).not.toHaveBeenCalled();
  });

  it('does not store a message id for a cleared approval', async () => {
    const cleared = buildSignup({
      partyStatus: PartyStatus.Cleared,
      progPoint: PartyStatus.Cleared,
    });

    await handler.handle(
      new SignupApprovedEvent(cleared, settings, approver, reviewMessage),
    );

    expect(repository.setApprovalMessageId).not.toHaveBeenCalled();
  });
});
