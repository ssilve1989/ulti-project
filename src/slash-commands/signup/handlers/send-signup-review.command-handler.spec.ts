import type { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { GuildMember } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { MissingChannelException } from '../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
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
      .setLogger(createAutoMock() as unknown as LoggerService)
      .compile();

    handler = fixture.get(SendSignupReviewCommandHandler);
    discordServiceMock = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    discordServiceMock.getEmojiString.mockReturnValueOnce('');
  });

  it('does not send a review if no review channel has been configured', async () => {
    const spy = vi.spyOn(handler, 'sendSignupForApproval');

    settingsCollection.getReviewChannel.mockResolvedValueOnce(undefined);

    await handler.execute({ signup: {} as SignupDocument, guildId: '' });

    expect(settingsCollection.getReviewChannel).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a review if a review channel has been configured', async () => {
    const spy = vi
      .spyOn(handler, 'sendSignupForApproval')
      .mockResolvedValue('reviewMessageId');

    settingsCollection.getReviewChannel.mockResolvedValueOnce('#foo');
    discordServiceMock.getGuildMember.mockResolvedValueOnce({
      displayAvatarURL: () => 'http://foo',
      toString: () => '<@ay>',
    } as unknown as GuildMember);

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
        signup: {
          encounter: Encounter.DSR,
          status: SignupStatus.PENDING,
          character: 'foo',
          world: 'bar',
        } as SignupDocument,
        guildId: '',
      }),
    ).rejects.toThrow(MissingChannelException);
  });
});
