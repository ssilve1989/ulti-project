import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Role } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditEncounterRolesCommandHandler } from './edit-encounter-roles.command-handler.js';

describe('Edit Encounter Roles Command Handler', () => {
  let handler: EditEncounterRolesCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditEncounterRolesCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditEncounterRolesCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
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

    await handler.execute({
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getString: (name: string, required?: boolean) =>
            name === 'encounter' ? encounter : null,
          getRole: (name: string, required?: boolean) => {
            switch (name) {
              case 'prog-role':
                return createMock<Role>({
                  id: progRoleId,
                  toString: () => `<@&${progRoleId}>`,
                  valueOf: () => '',
                });
              case 'clear-role':
                return createMock<Role>({
                  id: clearRoleId,
                  toString: () => `<@&${clearRoleId}>`,
                  valueOf: () => '',
                });
              default:
                return null;
            }
          },
        },
        valueOf: () => '',
      }),
    });

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
