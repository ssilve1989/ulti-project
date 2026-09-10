import type { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Encounter,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { GuildMember, Message } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { MissingChannelException } from '../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { SendSignupReviewCommandHandler } from './send-signup-review.command-handler.js';

describe('Send Signup Review Command Handler', () => {
  let handler: SendSignupReviewCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let discordServiceMock: Mocked<DiscordService>;

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
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SendSignupReviewCommandHandler],
    })
      .useMocker(createAutoMock)
      .setLogger(createAutoMock<LoggerService>())
      .compile();

    handler = fixture.get(SendSignupReviewCommandHandler);
    discordServiceMock = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    discordServiceMock.getEmojiString.mockReturnValueOnce('');
  });

  it('does not send a review if no review channel has been configured', async () => {
    const spy = vi.spyOn(handler, 'sendSignupForApproval');

    settingsCollection.getReviewChannel.mockResolvedValueOnce(undefined);

    await handler.execute({
      signup: partialMock<SignupDocument>({}),
      guildId: '',
    });

    expect(settingsCollection.getReviewChannel).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a review if a review channel has been configured', async () => {
    const spy = vi
      .spyOn(handler, 'sendSignupForApproval')
      .mockResolvedValue('reviewMessageId');

    settingsCollection.getReviewChannel.mockResolvedValueOnce('#foo');
    discordServiceMock.getGuildMember.mockResolvedValueOnce(
      mockOf<GuildMember>({
        displayAvatarURL: () => 'http://foo',
        toString: () => '<@ay>',
      }),
    );

    await handler.execute({
      signup,
      guildId: '',
    });

    expect(settingsCollection.getReviewChannel).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it('throws MissingChannelException if the channel does not exist in the guild', () => {
    settingsCollection.getReviewChannel.mockResolvedValueOnce('#foo');
    discordServiceMock.getTextChannel.mockResolvedValueOnce(null);

    return expect(() =>
      handler.execute({
        signup: partialMock<SignupDocument>({
          encounter: Encounter.DSR,
          status: SignupStatus.PENDING,
          character: 'foo',
          world: 'bar',
        }),
        guildId: '',
      }),
    ).rejects.toThrow(MissingChannelException);
  });

  describe('createSignupApprovalEmbed', () => {
    let send: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      send = vi.fn().mockResolvedValue(
        mockOf<Message<true>>({
          id: 'review-message-id',
          react: vi.fn().mockResolvedValue(undefined),
        }),
      );

      discordServiceMock.getTextChannel.mockResolvedValue(
        mockOf<
          NonNullable<
            Awaited<ReturnType<typeof discordServiceMock.getTextChannel>>
          >
        >({ send }),
      );
    });

    it('includes the previously approved prog point field when the signup has one', async () => {
      await handler.sendSignupForApproval(
        {
          ...signup,
          progPoint: 'p3-thordan',
          status: SignupStatus.UPDATE_PENDING,
        },
        '#channel',
        'guildId',
      );

      const embed = send.mock.calls[0][0].embeds[0];
      expect(embed.data.fields).toEqual(
        expect.arrayContaining([
          {
            name: 'Previously Approved Prog Point',
            value: 'p3-thordan',
            inline: true,
          },
        ]),
      );
    });

    it('omits the previously approved prog point field when the signup has none', async () => {
      await handler.sendSignupForApproval(signup, '#channel', 'guildId');

      const embed = send.mock.calls[0][0].embeds[0];
      expect(
        embed.data.fields?.some(
          (field: { name: string }) =>
            field.name === 'Previously Approved Prog Point',
        ),
      ).toBe(false);
    });
  });
});
