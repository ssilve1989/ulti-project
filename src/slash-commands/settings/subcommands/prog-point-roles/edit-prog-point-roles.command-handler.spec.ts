import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  Role,
} from 'discord.js';
import { StringSelectMenuBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { EncountersComponentsService } from '../../../../encounters/encounters-components.service.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import {
  EditProgPointRolesCommandHandler,
  PROG_POINT_ROLES_SELECT_ID,
} from './edit-prog-point-roles.command-handler.js';

describe('EditProgPointRolesCommandHandler', () => {
  let command: EditProgPointRolesCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let encountersComponentsService: Mocked<EncountersComponentsService>;
  let errorService: Mocked<ErrorService>;

  const guildId = 'guild-123';
  const roleId = 'role-456';

  const createSelection = (values: string[]) => ({
    customId: PROG_POINT_ROLES_SELECT_ID,
    isStringSelectMenu: () => true,
    values,
    update: vi.fn().mockResolvedValue(undefined),
  });

  const createInteraction = (options: {
    role: Role | null;
    selection: ReturnType<typeof createSelection>;
  }) => {
    const message = {
      awaitMessageComponent: vi.fn().mockResolvedValue(options.selection),
    } as unknown as Message<true>;

    return {
      guildId,
      user: { id: 'admin-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(message),
      options: {
        getString: vi.fn().mockReturnValue(Encounter.TOP),
        getRole: vi.fn().mockReturnValue(options.role),
      },
    } as unknown as ChatInputCommandInteraction<'cached'>;
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditProgPointRolesCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(EditProgPointRolesCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    encountersComponentsService = fixture.get(EncountersComponentsService);
    errorService = fixture.get(ErrorService);

    encountersComponentsService.createProgPointSelectMenu.mockResolvedValue(
      new StringSelectMenuBuilder()
        .setCustomId(PROG_POINT_ROLES_SELECT_ID)
        .addOptions([{ label: 'Phase 1', value: 'P1' }]),
    );
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('maps the selected prog points to the given role', async () => {
    const role = { id: roleId } as unknown as Role;
    const selection = createSelection(['P1', 'P2']);

    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { [Encounter.TOP]: { P1: 'old-role', P3: 'role-p3' } },
    });

    await command.execute(createInteraction({ role, selection }));

    expect(settingsCollection.setProgPointRoles).toHaveBeenCalledWith(
      guildId,
      Encounter.TOP,
      { P1: roleId, P2: roleId, P3: 'role-p3' },
    );
    expect(selection.update).toHaveBeenCalledWith(
      expect.objectContaining({ components: [] }),
    );
  });

  it('removes mappings for the selected prog points when role is omitted', async () => {
    const selection = createSelection(['P1']);

    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { [Encounter.TOP]: { P1: 'old-role', P3: 'role-p3' } },
    });

    await command.execute(createInteraction({ role: null, selection }));

    expect(settingsCollection.setProgPointRoles).toHaveBeenCalledWith(
      guildId,
      Encounter.TOP,
      { P3: 'role-p3' },
    );
  });

  it('requests a multi-select menu without the cleared option', async () => {
    const selection = createSelection(['P1']);
    settingsCollection.getSettings.mockResolvedValue(undefined);

    await command.execute(
      createInteraction({ role: { id: roleId } as unknown as Role, selection }),
    );

    expect(
      encountersComponentsService.createProgPointSelectMenu,
    ).toHaveBeenCalledWith(Encounter.TOP, {
      customId: PROG_POINT_ROLES_SELECT_ID,
      includeCleared: false,
      multiSelect: true,
    });
  });

  it('clears the select menu when handling the interaction throws', async () => {
    const selection = createSelection(['P1']);
    const error = new Error('firestore down');
    const mockErrorEmbed = {} as EmbedBuilder;

    settingsCollection.getSettings.mockRejectedValue(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = createInteraction({
      role: { id: roleId } as unknown as Role,
      selection,
    });

    await command.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenLastCalledWith({
      embeds: [mockErrorEmbed],
      components: [],
    });
  });
});
