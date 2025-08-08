import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditTurboProgCommandHandler } from './edit-turbo-prog.command-handler.js';

describe('Edit Turbo Prog Command Handler', () => {
  let handler: EditTurboProgCommandHandler;
  let settingsCollection: any;
  let errorService: any;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditTurboProgCommandHandler],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
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
        valueOf: () => '',
        editReply: vi.fn(),
        deferReply: vi.fn(),
      } as any,
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
        valueOf: () => '',
        editReply: vi.fn(),
        deferReply: vi.fn(),
      } as any,
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
    const mockErrorEmbed = {
      data: {},
      addFields: vi.fn(),
      setTitle: vi.fn(),
      setDescription: vi.fn(),
      setColor: vi.fn(),
      setFooter: vi.fn(),
      setTimestamp: vi.fn(),
    } as any;

    settingsCollection.getSettings.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      guildId: '12345',
      options: {
        getBoolean: (_: string, __?: boolean) => true,
        getString: (_: string) => 'test-spreadsheet-id',
      },
      valueOf: () => '',
      editReply: vi.fn(),
      deferReply: vi.fn(),
    } as any;

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
