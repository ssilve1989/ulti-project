import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import {
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  DiscordjsError,
  DiscordjsErrorCodes,
  Message,
} from 'discord.js';
import { SignupCommandHandler } from './signup-command.handler.js';
import { SignupCommand } from '../signup.commands.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';

describe('Signup Command Handler', () => {
  let handler: SignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction>;
  let confirmationInteraction: DeepMocked<Message<boolean>>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SignupCommandHandler],
    })
      .useMocker(() => createMock())
      .setLogger(createMock())
      .compile();

    handler = fixture.get(SignupCommandHandler);
    confirmationInteraction = createMock<Message<boolean>>({});
    interaction = createMock<ChatInputCommandInteraction>({
      options: {
        getString: (value: string) => {
          switch (value) {
            case 'encounter':
              return 'E9S';
            case 'character':
              return 'Test Character';
            case 'fflogs':
              return 'https://www.fflogs.com';
            case 'availability':
              return 'Monday, Wednesday, Friday';
            case 'world':
              return 'Jenova';
            case 'username':
              'Test User';
          }
        },
      },
      valueOf: () => '',
    });
  });

  test('is defined', () => {
    expect(handler).toBeDefined();
  });

  it('confirms a signup', async () => {
    const deferReplySpy = jest.spyOn(interaction, 'deferReply');
    const editReplySpy = jest.spyOn(interaction, 'editReply');

    confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
      createMock<ChannelSelectMenuInteraction<any>>({
        customId: 'confirm',
        valueOf: () => '',
      }),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(deferReplySpy).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReplySpy).toHaveBeenCalledTimes(2);
    expect(editReplySpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
      }),
    );
  });

  it('handles cancelling a signup', async () => {
    const deferReplySpy = jest.spyOn(interaction, 'deferReply');
    const editReplySpy = jest.spyOn(interaction, 'editReply');

    confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
      createMock<ChannelSelectMenuInteraction<any>>({
        customId: 'cancel',
        valueOf: () => '',
      }),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(deferReplySpy).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReplySpy).toHaveBeenCalledTimes(2);
    expect(editReplySpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CANCELLED,
      }),
    );
  });

  it('handles a timeout', async () => {
    const deferReplySpy = jest.spyOn(interaction, 'deferReply');
    const editReplySpy = jest.spyOn(interaction, 'editReply');

    confirmationInteraction.awaitMessageComponent.mockRejectedValueOnce(
      new DiscordjsError(DiscordjsErrorCodes.InteractionCollectorError),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(deferReplySpy).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReplySpy).toHaveBeenCalledTimes(2);
    expect(editReplySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
      }),
    );
  });
});
