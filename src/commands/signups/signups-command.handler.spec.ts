import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import {
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  Message,
} from 'discord.js';
import { SignupCommandHandler } from './signups-command.handler.js';
import { SignupCommand } from './signups.command.js';

describe('Signups Command Handler', () => {
  let handler: SignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction>;
  let confirmationInteraction: DeepMocked<Message<boolean>>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SignupCommandHandler],
    })
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
        content: expect.stringMatching(/Confirmed/i),
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
        content: expect.stringMatching(/Canceled/i),
      }),
    );
  });

  it('handles a timeout', async () => {
    const deferReplySpy = jest.spyOn(interaction, 'deferReply');
    const editReplySpy = jest.spyOn(interaction, 'editReply');

    confirmationInteraction.awaitMessageComponent.mockRejectedValueOnce(
      new Error('Timeout!'),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(deferReplySpy).toHaveBeenCalledWith({ ephemeral: true });
    expect(editReplySpy).toHaveBeenCalledTimes(2);
    expect(editReplySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/Confirmation not received/i),
      }),
    );
  });
});
