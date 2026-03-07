import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditTurboProgCommandHandler } from './edit-turbo-prog.command-handler.js';

describe('Edit Turbo Prog Command Handler', () => {
  let handler: EditTurboProgCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditTurboProgCommandHandler],
    })
      .useMocker(createAutoMock)
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
      interaction: {
        guildId,
        options: {
          getBoolean: (name: string, _required?: boolean) =>
            name === 'active' ? active : null,
          getString: (name: string) =>
            name === 'spreadsheet-id' ? spreadsheetId : null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>,
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
      interaction: {
        guildId,
        options: {
          getBoolean: (name: string, _required?: boolean) =>
            name === 'active' ? active : null,
          getString: () => null,
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>,
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
    const mockErrorEmbed = {} as EmbedBuilder;

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      guildId: '12345',
      options: {
        getBoolean: (_: string, __?: boolean) => true,
        getString: (_: string) => 'test-spreadsheet-id',
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
