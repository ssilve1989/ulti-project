import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditTurboProgCommandHandler } from './edit-turbo-prog.command-handler.js';

describe('Edit Turbo Prog Command Handler', () => {
  let handler: EditTurboProgCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let errorService: DeepMocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditTurboProgCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditTurboProgCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should update turbo prog settings', async () => {
    const guildId = '12345';
    const active = true;
    const spreadsheetId = 'new-spreadsheet-id';

    const existingSettings = {
      turboProgActive: false,
      turboProgSpreadsheetId: 'old-spreadsheet-id',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await handler.execute({
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getBoolean: (name: string, _required?: boolean) =>
            name === 'active' ? active : null,
          getString: (name: string) =>
            name === 'spreadsheet-id' ? spreadsheetId : null,
        },
        valueOf: () => '',
      }),
    });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        turboProgActive: active,
        turboProgSpreadsheetId: spreadsheetId,
      }),
    );
  });

  it('should handle optional spreadsheet ID', async () => {
    const guildId = '12345';
    const active = true;

    const existingSettings = {
      turboProgActive: false,
      turboProgSpreadsheetId: 'old-spreadsheet-id',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await handler.execute({
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getBoolean: (name: string, _required?: boolean) =>
            name === 'active' ? active : null,
          getString: () => null,
        },
        valueOf: () => '',
      }),
    });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        turboProgActive: active,
        turboProgSpreadsheetId: undefined,
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = createMock<EmbedBuilder>();

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = createMock<
      ChatInputCommandInteraction<'raw' | 'cached'>
    >({
      guildId: '12345',
      options: {
        getBoolean: (_: string, __?: boolean) => true,
        getString: (_: string) => 'test-spreadsheet-id',
      },
      valueOf: () => '',
    });

    await handler.execute({ interaction });

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
  });
});
