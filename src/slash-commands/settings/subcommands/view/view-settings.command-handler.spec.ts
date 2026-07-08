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

  it('renders prog point role mappings', async () => {
    const interaction =
      createAutoMock() as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      progPointRoles: {
        TOP: { P1: 'role-p1', P2: 'role-p2' },
      },
    });

    await command.execute(interaction);

    const [{ embeds }] = vi.mocked(interaction.editReply).mock.calls.at(-1) as [
      { embeds: { data: { fields: { name: string; value: string }[] } }[] },
    ];

    const field = embeds[0].data.fields.find(
      (f) => f.name === 'Prog Point Roles — TOP',
    );

    expect(field?.value).toContain('**P1:** <@&role-p1>');
    expect(field?.value).toContain('**P2:** <@&role-p2>');
  });

  it('renders a separate field per encounter with prog point role mappings', async () => {
    const interaction =
      createAutoMock() as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      progPointRoles: {
        TOP: { P1: 'role-p1' },
        DSR: { P1: 'role-dsr-p1' },
      },
    });

    await command.execute(interaction);

    const [{ embeds }] = vi.mocked(interaction.editReply).mock.calls.at(-1) as [
      { embeds: { data: { fields: { name: string; value: string }[] } }[] },
    ];

    const topField = embeds[0].data.fields.find(
      (f) => f.name === 'Prog Point Roles — TOP',
    );
    const dsrField = embeds[0].data.fields.find(
      (f) => f.name === 'Prog Point Roles — DSR',
    );

    expect(topField?.value).toContain('**P1:** <@&role-p1>');
    expect(dsrField?.value).toContain('**P1:** <@&role-dsr-p1>');
  });

  it('truncates an oversized prog point role field to fit the embed limit', async () => {
    const interaction =
      createAutoMock() as unknown as ChatInputCommandInteraction<'cached'>;

    const mapping: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      mapping[`ProgPointWithALongIdentifier${i}`] =
        `role-id-that-is-quite-long-${i}`;
    }

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      progPointRoles: {
        TOP: mapping,
      },
    });

    await command.execute(interaction);

    const [{ embeds }] = vi.mocked(interaction.editReply).mock.calls.at(-1) as [
      { embeds: { data: { fields: { name: string; value: string }[] } }[] },
    ];

    const field = embeds[0].data.fields.find(
      (f) => f.name === 'Prog Point Roles — TOP',
    );

    expect(field?.value.length).toBeLessThanOrEqual(1024);
    expect(field?.value).toMatch(/… and \d+ more$/);
  });

  it('renders a single "No roles set" field when no prog point roles are configured', async () => {
    const interaction =
      createAutoMock() as unknown as ChatInputCommandInteraction<'cached'>;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
    });

    await command.execute(interaction);

    const [{ embeds }] = vi.mocked(interaction.editReply).mock.calls.at(-1) as [
      { embeds: { data: { fields: { name: string; value: string }[] } }[] },
    ];

    const progPointFields = embeds[0].data.fields.filter((f) =>
      f.name.startsWith('Prog Point Roles'),
    );

    expect(progPointFields).toEqual([
      { name: 'Prog Point Roles', value: 'No roles set', inline: true },
    ]);
  });
});
