import type { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Encounter,
  type EncounterDocument,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { Message, User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { SendApprovedMessageEventHandler } from './send-approved-message.event-handler.js';

describe('Send Approved Message Event Handler', () => {
  let handler: SendApprovedMessageEventHandler;
  let discordService: Mocked<DiscordService>;
  let encountersService: Mocked<EncountersService>;

  const signup: SignupDocument = {
    character: 'foo',
    discordId: '12345',
    encounter: Encounter.DSR,
    expiresAt: Timestamp.now(),
    notes: 'im a note',
    progPointRequested: 'baz',
    proofOfProgLink: 'www.fflogs.com/reports/foo',
    role: 'healer',
    screenshot: 'http://somelinksurely',
    status: SignupStatus.PENDING,
    username: 'username',
    world: 'bar',
    partyStatus: PartyStatus.ProgParty,
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SendApprovedMessageEventHandler],
    })
      .useMocker(createAutoMock)
      .setLogger(createAutoMock<LoggerService>())
      .compile();

    handler = fixture.get(SendApprovedMessageEventHandler);
    discordService = fixture.get(DiscordService);
    encountersService = fixture.get(EncountersService);
  });

  function buildEvent(): {
    event: SignupApprovedEvent;
    send: ReturnType<typeof vi.fn>;
  } {
    const send = vi.fn().mockResolvedValue(mockOf<Message<true>>({}));
    discordService.getTextChannel.mockResolvedValue(
      mockOf<
        NonNullable<Awaited<ReturnType<typeof discordService.getTextChannel>>>
      >({ send }),
    );
    discordService.getDisplayName.mockResolvedValue('Reviewer');
    discordService.getGuildMember.mockResolvedValue(undefined);

    const event = new SignupApprovedEvent(
      signup,
      partialMock<SettingsDocument>({ signupChannel: 'channel-1' }),
      mockOf<User>({
        displayAvatarURL: vi
          .fn()
          .mockReturnValue('https://example.com/avatar.png'),
      }),
      mockOf<Message<true>>({ guildId: 'guild-1' }),
    );

    return { event, send };
  }

  it('uses the emoji from the Firestore encounter in the embed title', async () => {
    const { event, send } = buildEvent();
    encountersService.getEncounter.mockResolvedValueOnce(
      partialMock<EncounterDocument>({ emoji: '1128006062780448768' }),
    );
    discordService.getEmojiString.mockReturnValue('<:_:1128006062780448768>');

    await handler.handle(event);

    const embed = send.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('<:_:1128006062780448768>');
  });

  it('renders no emoji when the encounter document lacks one', async () => {
    const { event, send } = buildEvent();
    encountersService.getEncounter.mockResolvedValueOnce(undefined);
    discordService.getEmojiString.mockReturnValue('');

    await handler.handle(event);

    const embed = send.mock.calls[0][0].embeds[0];
    expect(embed.data.title).not.toContain('<:_:');
  });
});
