import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Role } from 'discord.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { EditSettingsCommandHandler } from './edit-settings.command-handler.js';

describe('Edit Settings Command Handler', () => {
  let handler: EditSettingsCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSettingsCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditSettingsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should upsert given settings', async () => {
    const guildId = '12345';
    const reviewerRole = '67890';
    const reviewChannel = '09876';
    const spreadsheetId = 'spreadsheetId';

    await handler.execute({
      interaction: createMock<ChatInputCommandInteraction<'raw' | 'cached'>>({
        guildId,
        options: {
          getRole: (key: string) => {
            switch (key) {
              case 'reviewer-role':
                return createMock({ id: reviewerRole });
              case `${Encounter.DSR.toLowerCase()}-prog-role`:
              case `${Encounter.UCOB.toLowerCase()}-prog-role`:
              case `${Encounter.TEA.toLowerCase()}-prog-role`:
              case `${Encounter.TOP.toLowerCase()}-prog-role`:
              case `${Encounter.UWU.toLowerCase()}-prog-role`:
                return createMock<Role>({
                  id: key,
                  valueOf: () => '',
                  toString: () => '<@&role>',
                });
              default:
                return null;
            }
          },
          getBoolean: () => true,
          getChannel: () => createMock({ id: reviewChannel }),
          getString: () => 'spreadsheetId',
        },
        valueOf: () => '',
      }),
    });

    expect(settingsCollection.upsert).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({
        reviewerRole,
        reviewChannel,
        spreadsheetId,
        signupChannel: reviewChannel,
        progRoles: {
          [Encounter.DSR]: 'dsr-prog-role',
          [Encounter.UCOB]: 'ucob-prog-role',
          [Encounter.TEA]: 'tea-prog-role',
          [Encounter.TOP]: 'top-prog-role',
          [Encounter.UWU]: 'uwu-prog-role',
        },
      }),
    );
  });
});
