import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditTurboProgCommandHandler } from './edit-turbo-prog.command-handler.js';

describe('Edit Turbo Prog Command Handler', () => {
  let handler: EditTurboProgCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditTurboProgCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditTurboProgCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
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
          getBoolean: (name: string, required?: boolean) =>
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
          getBoolean: (name: string, required?: boolean) =>
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
    settingsCollection.getSettings.mockRejectedValueOnce(error);

    const interaction = createMock<
      ChatInputCommandInteraction<'raw' | 'cached'>
    >({
      guildId: '12345',
      options: {
        getBoolean: (name: string, required?: boolean) => true,
        getString: (name: string) => 'test-spreadsheet-id',
      },
      valueOf: () => '',
    });

    await handler.execute({ interaction });

    expect(interaction.editReply).toHaveBeenCalledWith('Something went wrong!');
  });
});
