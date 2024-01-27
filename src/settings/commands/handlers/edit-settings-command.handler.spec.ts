import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { EditSettingsCommandHandler } from './edit-settings-command.handler.js';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import { SettingsService } from '../../settings.service.js';
import { ChatInputCommandInteraction } from 'discord.js';

describe('Edit Settings Command Handler', () => {
  let handler: EditSettingsCommandHandler;
  let settingsService: DeepMocked<SettingsService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSettingsCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(EditSettingsCommandHandler);
    settingsService = fixture.get(SettingsService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should upsert given settings', async () => {
    const guildId = '12345';
    const reviewerRole = '67890';
    const reviewChannel = '09876';
    const spreadsheetId = 'spreadsheetId';

    const upsertSpy = jest.spyOn(settingsService, 'upsertSettings');

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

    expect(upsertSpy).toHaveBeenCalledWith(guildId, {
      reviewerRole,
      reviewChannel,
      spreadsheetId,
    });
  });
});
