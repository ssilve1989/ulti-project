import { Test } from '@nestjs/testing';
import {
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  DiscordjsError,
  DiscordjsErrorCodes,
  Message,
} from 'discord.js';

import { DeepMocked, createMock } from '../../../test/create-mock.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { SettingsService } from '../settings/settings.service.js';
import { SIGNUP_MESSAGES } from './signup.consts.js';
import { PartyType } from '../../firebase/models/signup.model.js';
import { UnhandledButtonInteractionException } from '../../discord/discord.exceptions.js';
import { SignupCommand } from './signup.commands.js';
import { SignupCommandHandler } from './signup-command.handler.js';

describe('Signup Command Handler', () => {
  let handler: SignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let confirmationInteraction: DeepMocked<Message<boolean>>;
  let settingsService: DeepMocked<SettingsService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SignupCommandHandler],
    })
      .useMocker(() => createMock())
      .setLogger(createMock())
      .compile();

    handler = fixture.get(SignupCommandHandler);
    confirmationInteraction = createMock<Message<boolean>>({});

    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>({
      user: {
        username: 'Test User',
        id: '123456',
      },
      options: {
        getString: (value: string) => {
          switch (value) {
            case 'encounter':
              return Encounter.DSR;
            case 'character':
              return 'Test Character';
            case 'fflogs':
              return 'https://www.fflogs.com/reports/foo';
            case 'availability':
              return 'Monday, Wednesday, Friday';
            case 'world':
              return 'Jenova';
            case 'job':
              return 'tank';
            case 'party-type':
              return PartyType.CLEAR_PARTY;
          }
        },
        getAttachment: () => null,
      },
      valueOf: () => '',
    });

    settingsService = fixture.get(SettingsService);
  });

  test('is defined', () => {
    expect(handler).toBeDefined();
  });

  it('confirms a signup', async () => {
    confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
      createMock<ChannelSelectMenuInteraction>({
        customId: 'confirm',
        valueOf: () => '',
      }),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
      }),
    );
  });

  it('throws UnhandledButtonInteractionException if the interaction is unknown', async () => {
    const spy = vi.spyOn(handler, 'handleError' as any);

    confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
      createMock<ChannelSelectMenuInteraction>({
        customId: 'foo',
        valueOf: () => '',
      }),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);
    expect(spy).toHaveBeenCalledWith(
      expect.any(UnhandledButtonInteractionException),
      interaction,
    );
  });

  it('handles cancelling a signup', async () => {
    confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
      createMock<ChannelSelectMenuInteraction<any>>({
        customId: 'cancel',
        valueOf: () => '',
      }),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CANCELLED,
      }),
    );
  });

  it('handles a timeout', async () => {
    confirmationInteraction.awaitMessageComponent.mockRejectedValueOnce(
      new DiscordjsError(DiscordjsErrorCodes.InteractionCollectorError),
    );

    interaction.editReply.mockResolvedValue(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
      }),
    );
  });

  it('should not handle a signup if there is no review channel set', async () => {
    settingsService.getReviewChannel.mockResolvedValueOnce(undefined);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith(
      SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL,
    );
  });
});
