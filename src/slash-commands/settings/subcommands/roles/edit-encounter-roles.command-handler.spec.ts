import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { EditEncounterRolesCommandHandler } from './edit-encounter-roles.command-handler.js';

describe('Edit Encounter Roles Command Handler', () => {
  let handler: EditEncounterRolesCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditEncounterRolesCommandHandler],
    })
      .useMocker(createAutoMock)
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
      interaction: {
        guildId,
        options: {
          getString: (name: string, _required?: boolean) =>
            name === 'encounter' ? encounter : null,
          getRole: (name: string, _required?: boolean) => {
            switch (name) {
              case 'prog-role':
                return {
                  id: progRoleId,
                  toString: () => `<@&${progRoleId}>`,
                } as unknown as Role;
              case 'clear-role':
                return {
                  id: clearRoleId,
                  toString: () => `<@&${clearRoleId}>`,
                } as unknown as Role;
              default:
                return null;
            }
          },
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
      } as unknown as ChatInputCommandInteraction<'cached'>,
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
