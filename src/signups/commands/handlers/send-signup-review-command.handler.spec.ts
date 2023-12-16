import { DeepMocked, createMock } from '@golevelup/ts-jest';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Channel, Client, TextChannel } from 'discord.js';
import { Encounter } from '../../../app.consts.js';
import { DISCORD_CLIENT } from '../../../discord/discord.decorators.js';
import { SettingsService } from '../../../settings/settings.service.js';
import { SignupStatus } from '../../signup.consts.js';
import { Signup } from '../../signup.interfaces.js';
import { SendSignupReviewCommandHandler } from './send-signup-review-command.handler.js';
import {
  InvalidReviewChannelException,
  MissingChannelException,
} from '../../signup.exceptions.js';

describe('Send Signup Review Command Handler', () => {
  let handler: SendSignupReviewCommandHandler;
  let settingsService: DeepMocked<SettingsService>;
  let get: jest.Mock<() => Channel | undefined>;
  const signup = createMock<Signup>({
    encounter: Encounter.DSR,
    status: SignupStatus.PENDING,
    character: 'foo',
    world: 'bar',
    availability: 'baz',
    screenshot: 'http://somelinksurely',
  });

  beforeEach(async () => {
    get = jest.fn(() => undefined);

    const fixture = await Test.createTestingModule({
      providers: [
        SendSignupReviewCommandHandler,
        {
          provide: DISCORD_CLIENT,
          useValue: createMock<Client<true>>({
            guilds: {
              cache: {
                get: () => ({
                  valueOf: () => '',
                  channels: {
                    cache: {
                      get,
                    },
                  },
                }),
              },
            },
          }),
        },
      ],
    })
      .useMocker(() => createMock())
      .setLogger(createMock())
      .compile();

    handler = fixture.get(SendSignupReviewCommandHandler);
    settingsService = fixture.get(SettingsService);
  });

  it('does not send a review if no review channel has been configured', async () => {
    const spy = jest.spyOn(handler, 'sendSignupForApproval');

    settingsService.getReviewChannel.mockResolvedValueOnce(undefined);

    await handler.execute({ signup: createMock({}), guildId: '' });

    expect(settingsService.getReviewChannel).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a review if a review channel has been configured', async () => {
    const spy = jest.spyOn(handler, 'sendSignupForApproval');

    settingsService.getReviewChannel.mockResolvedValueOnce('#foo');
    get.mockReturnValueOnce(createMock<TextChannel>({}));

    await handler.execute({
      signup,
      guildId: '',
    });

    expect(settingsService.getReviewChannel).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it('throws MissingChannelException if the channel does not exist in the guild', () => {
    settingsService.getReviewChannel.mockResolvedValueOnce('#foo');
    get.mockReturnValueOnce(undefined);

    expect(() =>
      handler.execute({
        signup: createMock<Signup>({
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

  it('throws InvalidReviewChannelException if the channel is not a text channel', () => {
    settingsService.getReviewChannel.mockResolvedValueOnce('#foo');
    get.mockReturnValueOnce(createMock<Channel>({ isTextBased: () => false }));

    expect(() =>
      handler.execute({
        signup: createMock<Signup>({
          encounter: Encounter.DSR,
          status: SignupStatus.PENDING,
          character: 'foo',
          world: 'bar',
          availability: 'baz',
        }),
        guildId: '',
      }),
    ).rejects.toThrow(InvalidReviewChannelException);
  });
});
