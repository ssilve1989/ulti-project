import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditSpreadsheetCommandHandler } from './edit-spreadsheet.command-handler.js';

describe('Edit Spreadsheet Command Handler', () => {
  let handler: EditSpreadsheetCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let errorService: DeepMocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSpreadsheetCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditSpreadsheetCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should update spreadsheet settings', async () => {
    const guildId = '12345';
    const spreadsheetId = 'new-spreadsheet-id';

    const existingSettings = {
      spreadsheetId: 'old-spreadsheet-id',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await handler.execute({
      interaction: createMock<ChatInputCommandInteraction<'cached'>>({
        guildId,
        options: {
          getString: (name: string, _required?: boolean) =>
            name === 'spreadsheet-id' ? spreadsheetId : null,
        },
        valueOf: () => '',
      }),
    });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        spreadsheetId,
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = createMock<EmbedBuilder>();

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = createMock<ChatInputCommandInteraction<'cached'>>({
      guildId: '12345',
      options: {
        getString: (_name: string, _requiredd?: boolean) =>
          'test-spreadsheet-id',
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
