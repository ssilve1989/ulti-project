import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock, mockOf } from '../../../../test-utils/mock-factory.js';
import { EditSpreadsheetCommandHandler } from './edit-spreadsheet.command-handler.js';

describe('EditSpreadsheetCommandHandler', () => {
  let command: EditSpreadsheetCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSpreadsheetCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(EditSpreadsheetCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should update spreadsheet settings', async () => {
    const guildId = '12345';
    const spreadsheetId = 'new-spreadsheet-id';

    const existingSettings = {
      spreadsheetId: 'old-spreadsheet-id',
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await command.execute(
      mockOf<ChatInputCommandInteraction<'cached'>>({
        guildId,
        options: {
          getString: (name: string, _required?: boolean) =>
            name === 'spreadsheet-id' ? spreadsheetId : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      }),
    );

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        spreadsheetId,
      }),
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Test error');
    const mockErrorEmbed = mockOf<EmbedBuilder>({});

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      guildId: '12345',
      options: {
        getString: (_name: string, _requiredd?: boolean) =>
          'test-spreadsheet-id',
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    });

    await command.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
  });
});
