import { jest } from '@jest/globals';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import { ViewSettingsCommandHandler } from './view-settings-command.handler.js';
import { Test } from '@nestjs/testing';
import { SettingsService } from '../../settings.service.js';
import { ChatInputCommandInteraction } from 'discord.js';

describe('View Settings Command Handler', () => {
  let handler: ViewSettingsCommandHandler;
  let settingsService: DeepMocked<SettingsService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ViewSettingsCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(ViewSettingsCommandHandler);
    settingsService = fixture.get(SettingsService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should reply with the configured settings', async () => {
    const interaction =
      createMock<ChatInputCommandInteraction<'cached' | 'raw'>>();

    const deferSpy = jest.spyOn(interaction, 'deferReply');
    const replySpy = jest.spyOn(interaction, 'editReply');

    settingsService.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      reviewerRole: '67890',
      signupChannel: '09876',
    });

    await handler.execute({ interaction });

    expect(deferSpy).toHaveBeenCalled();
    expect(replySpy).toHaveBeenCalled();
  });
});
