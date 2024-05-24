import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction } from 'discord.js';

import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { ViewSettingsCommandHandler } from './view-settings.command-handler.js';

describe('View Settings Command Handler', () => {
  let handler: ViewSettingsCommandHandler;
  let settingsCollection: DeepMocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ViewSettingsCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(ViewSettingsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should reply with the configured settings', async () => {
    const interaction =
      createMock<ChatInputCommandInteraction<'cached' | 'raw'>>();

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      reviewerRole: '67890',
      signupChannel: '09876',
      progRoles: {},
    });

    await handler.execute({ interaction });

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });
});
