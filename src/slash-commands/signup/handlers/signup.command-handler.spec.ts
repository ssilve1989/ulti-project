import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import {
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  DiscordjsError,
  DiscordjsErrorCodes,
  EmbedBuilder,
  Message,
  MessageFlags,
} from 'discord.js';
import { UnhandledButtonInteractionException } from '../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../error/error.service.js';
import { expiredReportError } from '../../../fflogs/fflogs.consts.js';
import { FFLogsService } from '../../../fflogs/fflogs.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { SignupCommand } from '../commands/signup.commands.js';
import { SIGNUP_MESSAGES } from '../signup.consts.js';
import { SignupCommandHandler } from './signup.command-handler.js';

describe('Signup Command Handler', () => {
  let handler: SignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let confirmationInteraction: DeepMocked<Message<boolean>>;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let discordServiceMock: DeepMocked<DiscordService>;
  let signupCollectionMock: DeepMocked<SignupCollection>;
  let fflogsServiceMock: DeepMocked<FFLogsService>;
  let errorService: DeepMocked<ErrorService>;

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
    fflogsServiceMock = fixture.get(FFLogsService);
    errorService = fixture.get(ErrorService);

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
    errorService.handleCommandError.mockReturnValue(createMock<EmbedBuilder>());
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
      flags: MessageFlags.Ephemeral,
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
      signupCollectionMock.upsert.mockResolvedValueOnce(
        createMock<SignupDocument>({
          status,
          reviewMessageId: 'messageId123',
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
    async (status) => {
      confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
        createMock<ChannelSelectMenuInteraction>({
          customId: 'confirm',
          valueOf: () => '',
          guildId: 'g123',
        }),
      );

      interaction.editReply.mockResolvedValueOnce(confirmationInteraction);
      signupCollectionMock.upsert.mockResolvedValueOnce(
        createMock<SignupDocument>({
          status,
          reviewMessageId: 'messageId123',
        }),
      );

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(discordServiceMock.deleteMessage).not.toHaveBeenCalled();
    },
  );

  it('handles UnhandledButtonInteractionException with ErrorService', async () => {
    const mockErrorEmbed = createMock<EmbedBuilder>();
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    confirmationInteraction.awaitMessageComponent.mockResolvedValueOnce(
      createMock<ChannelSelectMenuInteraction>({
        customId: 'foo',
        valueOf: () => '',
      }),
    );

    interaction.editReply.mockResolvedValueOnce(confirmationInteraction);

    const command = new SignupCommand(interaction);
    await handler.execute(command);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      expect.any(UnhandledButtonInteractionException),
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
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
      flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.editReply).toHaveBeenCalledWith(
      SIGNUP_MESSAGES.MISSING_SIGNUP_REVIEW_CHANNEL,
    );
  });

  describe('FFLogs Validation', () => {
    beforeEach(() => {
      settingsCollection.getReviewChannel.mockResolvedValue('123456789');
      errorService.handleCommandError.mockReturnValue(
        createMock<EmbedBuilder>(),
      );
      // Set up default values for FFLogs tests
      (interaction.options.getString as any) = (key: string) => {
        switch (key) {
          case 'availability':
            return 'Available all day';
          case 'character':
            return 'Test Character';
          case 'encounter':
            return 'FRU';
          case 'prog-proof-link':
            return 'https://fflogs.com/reports/ABC123def456';
          case 'prog-point':
            return 'P1';
          case 'job':
            return 'DPS';
          case 'world':
            return 'Gilgamesh';
          case 'notes':
            return null;
          default:
            return null;
        }
      };
    });

    test('should fail validation for old FFLogs report', async () => {
      fflogsServiceMock.validateReportAge.mockResolvedValue({
        isValid: false,
        errorMessage: expiredReportError(35, 28),
      });

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(fflogsServiceMock.validateReportAge).toHaveBeenCalledWith(
        'ABC123def456',
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '❌ FFLogs Check Failed',
                description: expiredReportError(35, 28),
              }),
            }),
          ]),
        }),
      );
    });

    test('should handle malformed FFLogs URLs', async () => {
      (interaction.options.getString as any) = (key: string) => {
        switch (key) {
          case 'availability':
            return 'Available all day';
          case 'character':
            return 'Test Character';
          case 'encounter':
            return 'FRU';
          case 'prog-proof-link':
            return 'https://fflogs.com/invalid-url';
          case 'prog-point':
            return 'P1';
          case 'job':
            return 'DPS';
          case 'world':
            return 'Gilgamesh';
          case 'notes':
            return null;
          default:
            return null;
        }
      };

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(fflogsServiceMock.validateReportAge).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '❌ FFLogs Check Failed',
                description: expect.stringContaining(
                  'Invalid FFLogs URL format. Please provide a valid link to a report.',
                ),
              }),
            }),
          ]),
        }),
      );
    });

    test('should proceed for valid FFLogs report', async () => {
      fflogsServiceMock.validateReportAge.mockResolvedValue({
        isValid: true,
        reportDate: new Date(),
      });

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(fflogsServiceMock.validateReportAge).toHaveBeenCalledWith(
        'ABC123def456',
      );
      expect(interaction.editReply).not.toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '❌ Signup Validation Failed',
              }),
            }),
          ]),
        }),
      );
    });

    test('should skip FFLogs validation for non-FFLogs URLs', async () => {
      (interaction.options.getString as any) = (key: string) => {
        switch (key) {
          case 'availability':
            return 'Available all day';
          case 'character':
            return 'Test Character';
          case 'encounter':
            return 'FRU';
          case 'prog-proof-link':
            return 'https://youtube.com/watch?v=test';
          case 'prog-point':
            return 'P1';
          case 'job':
            return 'DPS';
          case 'world':
            return 'Gilgamesh';
          case 'notes':
            return null;
          default:
            return null;
        }
      };

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(fflogsServiceMock.validateReportAge).not.toHaveBeenCalled();
    });

    test('should handle FFLogs service errors gracefully', async () => {
      fflogsServiceMock.validateReportAge.mockRejectedValue(
        new Error('API Error'),
      );

      const command = new SignupCommand(interaction);
      await handler.execute(command);

      expect(fflogsServiceMock.validateReportAge).toHaveBeenCalledWith(
        'ABC123def456',
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '❌ FFLogs Check Failed',
                description: expect.stringContaining(
                  'Unable to validate report age due to API issues',
                ),
              }),
            }),
          ]),
        }),
      );
    });
  });
});
