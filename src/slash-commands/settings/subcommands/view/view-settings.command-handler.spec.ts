import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { ViewSettingsCommandHandler } from './view-settings.command-handler.js';

describe('ViewSettingsCommandHandler', () => {
  let command: ViewSettingsCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let sheetsService: Mocked<SheetsService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ViewSettingsCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(ViewSettingsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    sheetsService = fixture.get(SheetsService);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should reply with the configured settings', async () => {
    const interaction =
      createAutoMock() as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      reviewerRole: '67890',
      signupChannel: '09876',
      progRoles: {},
    });

    await command.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('replies with a fallback field when sheet metadata fetch fails', async () => {
    const interaction =
      createAutoMock() as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      progRoles: {},
      spreadsheetId: 'sheet-abc',
    });

    sheetsService.getSheetMetadata.mockRejectedValueOnce(
      new Error('The operation was aborted'),
    );

    await command.execute(interaction);

    const [{ embeds }] = vi.mocked(interaction.editReply).mock.calls.at(-1) as [
      { embeds: { data: { fields: unknown[] } }[] },
    ];

    expect(embeds[0].data.fields).toContainEqual(
      expect.objectContaining({
        name: 'Managed Spreadsheet',
        value: 'Unable to fetch sheet info',
      }),
    );
  });
});
