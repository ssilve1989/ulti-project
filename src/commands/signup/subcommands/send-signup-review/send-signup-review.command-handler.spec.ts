import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { GuildMember, TextChannel } from 'discord.js';
import { Mock } from 'vitest';
import { MissingChannelException } from '../../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import {
  SignupDocument,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SendSignupReviewCommandHandler } from './send-signup-review.command-handler.js';

describe('Send Signup Review Command Handler', () => {
  let handler: SendSignupReviewCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let discordServiceMock: DeepMocked<DiscordService>;

  let get: Mock;
  const signup = createMock<SignupDocument>({
    availability: 'baz',
    character: 'foo',
    encounter: Encounter.DSR,
    role: 'healer',
    screenshot: 'http://somelinksurely',
    status: SignupStatus.PENDING,
    world: 'bar',
    progPointRequested: 'baz',
  });

  beforeEach(async () => {
    get = vi.fn(() => undefined);

    const fixture = await Test.createTestingModule({
      providers: [SendSignupReviewCommandHandler],
    })
      .useMocker(() => createMock())
      .setLogger(createMock())
      .compile();

    handler = fixture.get(SendSignupReviewCommandHandler);
    discordServiceMock = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    discordServiceMock.getEmojiString.mockReturnValueOnce('');
  });

  it('does not send a review if no review channel has been configured', async () => {
    const spy = vi.spyOn(handler, 'sendSignupForApproval');

    settingsCollection.getReviewChannel.mockResolvedValueOnce(undefined);

    await handler.execute({ signup: createMock({}), guildId: '' });

    expect(settingsCollection.getReviewChannel).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a review if a review channel has been configured', async () => {
    const spy = vi.spyOn(handler, 'sendSignupForApproval');

    settingsCollection.getReviewChannel.mockResolvedValueOnce('#foo');
    get.mockReturnValueOnce(createMock<TextChannel>({}));
    discordServiceMock.getGuildMember.mockResolvedValueOnce(
      createMock<GuildMember>({
        displayAvatarURL: () => 'http://foo',
        toString: () => '<@ay>',
        valueOf: () => '',
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

    get.mockReturnValueOnce(undefined);

    expect(() =>
      handler.execute({
        signup: createMock<SignupDocument>({
          encounter: Encounter.DSR,
          status: SignupStatus.PENDING,
          character: 'foo',
          world: 'bar',
          availability: 'baz',
        }),
        guildId: '',
      }),
    ).rejects.toThrow(MissingChannelException);
  });
});
