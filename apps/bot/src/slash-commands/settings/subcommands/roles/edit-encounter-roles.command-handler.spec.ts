import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock, mockOf } from '../../../../test-utils/mock-factory.js';
import { EditEncounterRolesCommandHandler } from './edit-encounter-roles.command-handler.js';

describe('EditEncounterRolesCommandHandler', () => {
  let command: EditEncounterRolesCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditEncounterRolesCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(EditEncounterRolesCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should update encounter roles', async () => {
    const guildId = '12345';
    const encounter = 'TOP';
    const progRoleId = 'prog-role-id';
    const clearRoleId = 'clear-role-id';

    const existingSettings = {
      progRoles: {},
      clearRoles: {},
    };

    settingsCollection.getSettings.mockResolvedValueOnce(existingSettings);

    await command.execute(
      mockOf<ChatInputCommandInteraction<'cached'>>({
        guildId,
        options: {
          getString: (name: string, _required?: boolean) =>
            name === 'encounter' ? encounter : null,
          getRole: (name: string, _required?: boolean) => {
            switch (name) {
              case 'prog-role':
                return mockOf<Role>({
                  id: progRoleId,
                  toString: () => `<@&${progRoleId}>`,
                });
              case 'clear-role':
                return mockOf<Role>({
                  id: clearRoleId,
                  toString: () => `<@&${clearRoleId}>`,
                });
              default:
                return null;
            }
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      }),
    );

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        progRoles: {
          [encounter]: progRoleId,
        },
        clearRoles: {
          [encounter]: clearRoleId,
        },
      }),
    );
  });
});
