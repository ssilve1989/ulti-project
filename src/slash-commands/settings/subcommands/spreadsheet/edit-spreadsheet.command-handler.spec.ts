import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditSpreadsheetCommandHandler } from './edit-spreadsheet.command-handler.js';

describe('Edit Spreadsheet Command Handler', () => {
  let handler: EditSpreadsheetCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSpreadsheetCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditSpreadsheetCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
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
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getString: (name: string, required?: boolean) =>
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
    settingsCollection.getSettings.mockRejectedValueOnce(error);

    const interaction = createMock<
      ChatInputCommandInteraction<'raw' | 'cached'>
    >({
      guildId: '12345',
      options: {
        getString: (name: string, required?: boolean) => 'test-spreadsheet-id',
      },
      valueOf: () => '',
    });

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith('Something went wrong!');
  });
});
