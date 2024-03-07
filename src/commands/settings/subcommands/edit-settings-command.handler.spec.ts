import { Test } from '@nestjs/testing';
import { EditSettingsCommandHandler } from './edit-settings-command.handler.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { ChatInputCommandInteraction } from 'discord.js';
import { DeepMocked, createMock } from '../../../../test/create-mock.js';

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
          getRole: () => createMock({ id: reviewerRole }),
          getChannel: () => createMock({ id: reviewChannel }),
          getString: () => 'spreadsheetId',
        },
        valueOf: () => '',
      }),
    });

    expect(settingsCollection.upsertSettings).toHaveBeenCalledWith(guildId, {
      reviewerRole,
      reviewChannel,
      spreadsheetId,
      signupChannel: reviewChannel,
    });
  });
});
