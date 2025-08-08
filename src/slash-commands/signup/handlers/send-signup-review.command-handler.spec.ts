import { Test } from '@nestjs/testing';
import { GuildMember, TextChannel } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingChannelException } from '../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { SendSignupReviewCommandHandler } from './send-signup-review.command-handler.js';

describe('Send Signup Review Command Handler', () => {
  let handler: SendSignupReviewCommandHandler;
  let settingsCollection: any;
  let discordServiceMock: any;

  let get: Mock;
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
    get = vi.fn(() => undefined);

    const fixture = await Test.createTestingModule({
      providers: [SendSignupReviewCommandHandler],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
      .setLogger({
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
      })
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
    const spy = vi.spyOn(handler, 'sendSignupForApproval');

    settingsCollection.getReviewChannel.mockResolvedValueOnce('#foo');
    discordServiceMock.getTextChannel.mockResolvedValueOnce({
      send: vi.fn().mockResolvedValue({ 
        id: 'message-id', 
        react: vi.fn().mockResolvedValue(undefined) 
      }),
    } as any);
    get.mockReturnValueOnce({} as TextChannel);
    discordServiceMock.getGuildMember.mockResolvedValueOnce({
      displayAvatarURL: () => 'http://foo',
      toString: () => '<@ay>',
      valueOf: () => 'some value',
    } as GuildMember);

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

    get.mockReturnValueOnce(undefined);

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
