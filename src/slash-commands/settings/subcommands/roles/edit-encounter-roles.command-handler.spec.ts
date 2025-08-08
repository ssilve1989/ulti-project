import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Role } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditEncounterRolesCommandHandler } from './edit-encounter-roles.command-handler.js';

describe('Edit Encounter Roles Command Handler', () => {
  let handler: EditEncounterRolesCommandHandler;
  let settingsCollection: any;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditEncounterRolesCommandHandler],
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
                  valueOf: () => '',
                };
              case 'clear-role':
                return {
                  id: clearRoleId,
                  toString: () => `<@&${clearRoleId}>`,
                  valueOf: () => '',
                };
              default:
                return null;
            }
          },
        },
        valueOf: () => '',
        editReply: vi.fn(),
        deferReply: vi.fn(),
      } as any,
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
