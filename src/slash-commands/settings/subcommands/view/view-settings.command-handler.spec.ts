import { Test } from '@nestjs/testing';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import type { SettingsDocument } from '../../../../firebase/models/settings.model.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { ViewSettingsCommandHandler } from './view-settings.command-handler.js';
import {
  SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
  SETTINGS_VIEW_ENCOUNTER_SELECT_ID,
  SETTINGS_VIEW_OVERVIEW_BUTTON_ID,
  SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
} from './view-settings.components.js';

type EmbedPayload = {
  embeds: {
    data: {
      title?: string;
      description?: string;
      fields?: { name: string; value: string }[];
    };
  }[];
  components: { toJSON: () => { components: unknown[] } }[];
};

describe('ViewSettingsCommandHandler', () => {
  let command: ViewSettingsCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let sheetsService: Mocked<SheetsService>;
  let errorService: Mocked<ErrorService>;

  const baseSettings: SettingsDocument = {
    autoModChannelId: 'automod-chan',
    reviewChannel: 'review-chan',
    signupChannel: 'signup-chan',
    reviewerRole: 'reviewer-role',
    turboProgActive: true,
    progRoles: { TOP: 'top-prog' },
    clearRoles: { TOP: 'top-clear', DSR: 'dsr-clear' },
    progPointRoles: { TOP: { P1: 'r1', P2: 'r2' }, DSR: { P3: 'r3' } },
  };

  function createInteraction() {
    const interaction = createAutoMock() as unknown as Mocked<
      ChatInputCommandInteraction<'cached'>
    >;
    const collector = createAutoMock();
    const callbacks: {
      collect?: (i: unknown) => Promise<void>;
      end?: () => Promise<void>;
    } = {};

    collector.on.mockImplementation((event: string, cb: never) => {
      if (event === 'collect') callbacks.collect = cb;
      if (event === 'end') callbacks.end = cb;
      return collector;
    });

    const replyMessage = createAutoMock();
    replyMessage.createMessageComponentCollector.mockReturnValue(collector);

    vi.mocked(interaction.editReply).mockResolvedValue(replyMessage as never);
    interaction.user = { id: 'user123' } as never;

    return { interaction, replyMessage, callbacks };
  }

  function createButtonInteraction(customId: string) {
    const button = createAutoMock() as unknown as Mocked<ButtonInteraction>;
    button.customId = customId;
    button.isStringSelectMenu.mockReturnValue(false);
    return button;
  }

  function createSelectInteraction(customId: string, values: string[]) {
    const select =
      createAutoMock() as unknown as Mocked<StringSelectMenuInteraction>;
    select.customId = customId;
    select.values = values;
    select.isStringSelectMenu.mockReturnValue(true);
    return select;
  }

  function lastReplyPayload(mock: { mock: { calls: unknown[][] } }) {
    return mock.mock.calls.at(-1)?.[0] as EmbedPayload;
  }

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ViewSettingsCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(ViewSettingsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    sheetsService = fixture.get(SheetsService);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('replies with an overview embed of core settings and role summary counts', async () => {
    const { interaction } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);

    const { embeds, components } = lastReplyPayload(
      vi.mocked(interaction.editReply),
    );
    const fields = embeds[0].data.fields ?? [];

    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Review Channel',
        value: '<#review-chan>',
      }),
    );
    // falls back to the auto-mod channel while no blacklist list is configured
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Blacklist Channels',
        value: '<#automod-chan>',
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Reviewer Role',
        value: '<@&reviewer-role>',
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Prog Roles',
        value: '1 encounter configured',
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Clear Roles',
        value: '2 encounters configured',
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Prog Point Roles',
        value: '2 encounters configured (3 prog points)',
      }),
    );

    // no per-encounter prog point fields on the overview anymore
    expect(fields.some((f) => f.name.startsWith('Prog Point Roles — '))).toBe(
      false,
    );

    // a single nav button row
    expect(components).toHaveLength(1);
    expect(components[0].toJSON().components).toHaveLength(3);
  });

  it('replies with a fallback field when sheet metadata fetch fails', async () => {
    const { interaction } = createInteraction();

    settingsCollection.getSettings.mockResolvedValueOnce({
      ...baseSettings,
      spreadsheetId: 'sheet-abc',
    });
    sheetsService.getSheetMetadata.mockRejectedValueOnce(
      new Error('The operation was aborted'),
    );

    await command.execute(interaction);

    const { embeds } = lastReplyPayload(vi.mocked(interaction.editReply));

    expect(embeds[0].data.fields).toContainEqual(
      expect.objectContaining({
        name: 'Managed Spreadsheet',
        value: 'Unable to fetch sheet info',
      }),
    );
  });

  it('shows prog and clear role mappings when the encounter roles button is clicked', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);

    const button = createButtonInteraction(
      SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID,
    );
    await callbacks.collect?.(button);

    expect(button.deferUpdate).toHaveBeenCalled();

    const { embeds } = lastReplyPayload(vi.mocked(button.editReply));
    const fields = embeds[0].data.fields ?? [];

    expect(embeds[0].data.title).toBe('Settings — Encounter Roles');
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Prog Roles',
        value: '**TOP:** <@&top-prog>',
      }),
    );
    expect(fields.find((f) => f.name === 'Clear Roles')?.value).toContain(
      '**DSR:** <@&dsr-clear>',
    );
  });

  it('shows an encounter select menu when the prog point roles button is clicked', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce({
      ...baseSettings,
      progPointRoles: { TOP: { P1: 'r1' }, DSR: {} },
    });

    await command.execute(interaction);

    const button = createButtonInteraction(
      SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
    );
    await callbacks.collect?.(button);

    const { embeds, components } = lastReplyPayload(
      vi.mocked(button.editReply),
    );

    expect(embeds[0].data.description).toBe(
      'Select an encounter below to view its prog point role mappings.',
    );
    expect(components).toHaveLength(2);

    // encounters with an empty mapping are not selectable
    const selectRow = components[1].toJSON() as {
      components: { options: { value: string }[] }[];
    };
    expect(selectRow.components[0].options).toEqual([
      expect.objectContaining({ value: Encounter.TOP }),
    ]);
  });

  it('shows the selected encounter prog point role mappings', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);

    const select = createSelectInteraction(SETTINGS_VIEW_ENCOUNTER_SELECT_ID, [
      Encounter.TOP,
    ]);
    await callbacks.collect?.(select);

    const { embeds, components } = lastReplyPayload(
      vi.mocked(select.editReply),
    );

    expect(embeds[0].data.title).toBe('Settings — Prog Point Roles — TOP');
    expect(embeds[0].data.description).toContain('**P1:** <@&r1>');
    expect(embeds[0].data.description).toContain('**P2:** <@&r2>');
    expect(components).toHaveLength(2);
  });

  it('returns to the overview without re-fetching sheet metadata', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce({
      ...baseSettings,
      spreadsheetId: 'sheet-abc',
    });
    sheetsService.getSheetMetadata.mockResolvedValue({
      title: 'My Sheet',
      url: 'https://sheets.example/abc',
    } as never);

    await command.execute(interaction);
    const fetchCount = sheetsService.getSheetMetadata.mock.calls.length;

    await callbacks.collect?.(
      createButtonInteraction(SETTINGS_VIEW_ENCOUNTER_ROLES_BUTTON_ID),
    );
    const overviewButton = createButtonInteraction(
      SETTINGS_VIEW_OVERVIEW_BUTTON_ID,
    );
    await callbacks.collect?.(overviewButton);

    const { embeds } = lastReplyPayload(vi.mocked(overviewButton.editReply));

    expect(embeds[0].data.fields).toContainEqual(
      expect.objectContaining({
        name: 'Managed Spreadsheet',
        value: '[My Sheet](https://sheets.example/abc)',
      }),
    );
    expect(sheetsService.getSheetMetadata.mock.calls.length).toBe(fetchCount);
  });

  it('omits the select menu when no prog point roles are configured', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce({
      ...baseSettings,
      progPointRoles: undefined,
    });

    await command.execute(interaction);

    const button = createButtonInteraction(
      SETTINGS_VIEW_PROG_POINT_ROLES_BUTTON_ID,
    );
    await callbacks.collect?.(button);

    const { embeds, components } = lastReplyPayload(
      vi.mocked(button.editReply),
    );

    expect(embeds[0].data.description).toBe('No prog point roles configured.');
    expect(components).toHaveLength(1);
  });

  it('does not create a collector when no settings are found', async () => {
    const { interaction, replyMessage } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('No settings found!');
    expect(replyMessage.createMessageComponentCollector).not.toHaveBeenCalled();
  });

  it('removes the components when the collector ends', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);
    await callbacks.end?.();

    expect(interaction.editReply).toHaveBeenLastCalledWith({
      content: 'Settings view has expired. Run /settings view again if needed.',
      components: [],
    });
  });

  it('captures component interaction errors instead of rejecting', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);

    const button = createButtonInteraction(SETTINGS_VIEW_OVERVIEW_BUTTON_ID);
    vi.mocked(button.deferUpdate).mockRejectedValueOnce(
      new Error('Unknown interaction'),
    );

    // an unhandled rejection here would crash the bot via the
    // process-level unhandledRejection handler in main.ts
    await expect(callbacks.collect?.(button)).resolves.toBeUndefined();
    expect(errorService.captureError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('ignores select values that are not valid encounters', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);

    const select = createSelectInteraction(SETTINGS_VIEW_ENCOUNTER_SELECT_ID, [
      'NOT_AN_ENCOUNTER',
    ]);
    await callbacks.collect?.(select);

    expect(select.editReply).not.toHaveBeenCalled();
  });

  it('creates the collector scoped to the invoking user with a timeout', async () => {
    const { interaction, replyMessage } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(baseSettings);

    await command.execute(interaction);

    expect(replyMessage.createMessageComponentCollector).toHaveBeenCalledWith({
      filter: expect.any(Function),
      time: 300000,
    });
  });
});
