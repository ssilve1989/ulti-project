import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import {
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  DiscordjsError,
  DiscordjsErrorCodes,
  Message,
} from 'discord.js';
import { UnhandledButtonInteractionException } from '../../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { SignupCommand } from '../signup.commands.js';
import { SignupCommandHandler } from './signup.command-handler.js';

describe('Signup Command Handler', () => {
  let handler: SignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let confirmationInteraction: DeepMocked<Message<boolean>>;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let discordServiceMock: DeepMocked<DiscordService>;
  let signupCollectionMock: DeepMocked<SignupCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SignupCommandHandler],
    })
      .useMocker(() => createMock())
      .setLogger(createMock())
      .compile();

    confirmationInteraction = createMock<Message<boolean>>({});
    discordServiceMock = fixture.get(DiscordService);
    handler = fixture.get(SignupCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    signupCollectionMock = fixture.get(SignupCollection);

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
            case 'prog-proof-link':
              return 'https://www.fflogs.com/reports/foo';
            case 'availability':
              return 'Monday, Wednesday, Friday';
            case 'world':
              return 'Jenova';
            case 'job':
              return 'tank';
            case 'party-type':
              return PartyStatus.ClearParty;
            case 'prog-point':
              return 'all the progs';
          }
        },
        getAttachment: () => null,
      },
      valueOf: () => '',
    });

    discordServiceMock.getDisplayName.mockResolvedValue('Test Character');
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

    expect(interaction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
    expect(interaction.editReply).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
      }),
    );
  });

  it.each([SignupStatus.PENDING, SignupStatus.UPDATE_PENDING])(
    'deletes a prior review message on confirm if it exists and has status %s',
    async (status) => {
      confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
        createMock<ChannelSelectMenuInteraction>({
          customId: 'confirm',
          valueOf: () => '',
          guildId: 'g123',
        }),
      );

      interaction.editReply.mockResolvedValueOnce(confirmationInteraction);
      signupCollectionMock.findById.mockResolvedValueOnce(
        createMock<SignupDocument>({
          status,
        }),
      );

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(discordServiceMock.deleteMessage).toHaveBeenCalled();

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: SIGNUP_MESSAGES.SIGNUP_SUBMISSION_CONFIRMED,
        }),
      );
    },
  );

  it.each([SignupStatus.APPROVED, SignupStatus.DECLINED])(
    'does not call delete if the prior approval has status %s',
    (status) => {
      confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
        createMock<ChannelSelectMenuInteraction>({
          customId: 'confirm',
          valueOf: () => '',
        }),
      );

      interaction.editReply.mockResolvedValueOnce(confirmationInteraction);
      signupCollectionMock.findById.mockResolvedValueOnce(
        createMock<SignupDocument>({
          status,
        }),
      );

      const command = new SignupCommand(interaction);
      handler.execute(command);

      expect(discordServiceMock.deleteMessage).not.toHaveBeenCalled();
    },
  );

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

    expect(interaction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
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
      createMock<DiscordjsError>({
        code: DiscordjsErrorCodes.InteractionCollectorError,
      }),
    );

    interaction.editReply.mockResolvedValue(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(interaction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
    expect(interaction.editReply).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: SIGNUP_MESSAGES.CONFIRMATION_TIMEOUT,
      }),
    );
  });

  it('should not handle a signup if there is no review channel set', async () => {
    settingsCollection.getReviewChannel.mockResolvedValueOnce(undefined);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(interaction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });
    expect(interaction.editReply).toHaveBeenCalledWith(
      SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL,
    );
  });
});
