import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditSpreadsheetCommandHandler } from './edit-spreadsheet.command-handler.js';

describe('Edit Spreadsheet Command Handler', () => {
  let handler: EditSpreadsheetCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSpreadsheetCommandHandler],
    })
      .useMocker(createAutoMock)
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
      interaction: {
        guildId,
        options: {
          getString: (name: string, _required?: boolean) =>
            name === 'spreadsheet-id' ? spreadsheetId : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>,
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
    const mockErrorEmbed = {} as EmbedBuilder;

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      guildId: '12345',
      options: {
        getString: (_name: string, _requiredd?: boolean) =>
          'test-spreadsheet-id',
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

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
