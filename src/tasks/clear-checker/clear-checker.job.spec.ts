import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { DiscordService } from '../../discord/discord.service.js';
import { FFLogsService } from '../../fflogs/fflogs.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import { clearCheckerConfig } from './clear-checker.config.js';
import { ClearCheckerJob } from './clear-checker.job.js';

describe('ClearCheckerJob', () => {
  let clearCheckerJob: ClearCheckerJob;
  let discordService: DeepMocked<DiscordService>;
  let fflogsService: DeepMocked<FFLogsService>;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let signupsCollection: DeepMocked<SignupCollection>;
  let sheetsService: DeepMocked<SheetsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClearCheckerJob,
        {
          provide: clearCheckerConfig.KEY,
          useValue: {
            CLEAR_CHECKER_MODE: 'execute',
          },
        },
      ],
    })
      .useMocker(() => createMock({}))
      .compile();

    clearCheckerJob = module.get<ClearCheckerJob>(ClearCheckerJob);
    discordService = module.get<DiscordService>(DiscordService);
    fflogsService = module.get<FFLogsService>(FFLogsService);
    settingsCollection = module.get<SettingsCollection>(SettingsCollection);
    signupsCollection = module.get<SignupCollection>(SignupCollection);
    sheetsService = module.get<SheetsService>(SheetsService);
  });

  it('should be defined', () => {
    expect(clearCheckerJob).toBeDefined();
  });

  describe('checkClears', () => {
    it('should process signups and publish results', async () => {
      const signups = [
        {
          character: 'Character1',
          encounter: 'DSR',
          world: 'World1',
          discordId: '123',
          reviewMessageId: '456',
        },
        {
          character: 'Character2',
          encounter: 'TOP',
          world: 'World2',
          discordId: '789',
          reviewMessageId: '012',
        },
      ];

      signupsCollection.findAll.mockResolvedValue(signups);
      signupsCollection.removeSignup.mockResolvedValue(undefined);

      fflogsService.hasClearedEncounter.mockReturnValue(of(true));

      sheetsService.removeSignup.mockResolvedValue(undefined);

      discordService.deleteMessage.mockResolvedValue(undefined);

      settingsCollection.getSettings.mockResolvedValue({
        modChannelId: 'modChannelId',
        spreadsheetId: 'spreadsheetId',
        reviewChannel: 'reviewChannel',
        reviewMessageId: 'reviewMessageId',
      });

      discordService.getTextChannel.mockResolvedValue({
        send: vi.fn().mockResolvedValue(undefined),
      });

      await clearCheckerJob.checkClears();

      expect(signupsCollection.findAll).toHaveBeenCalledWith({});
      expect(fflogsService.hasClearedEncounter).toHaveBeenCalledTimes(
        signups.length,
      );
      expect(signupsCollection.removeSignup).toHaveBeenCalledTimes(
        signups.length,
      );
      expect(sheetsService.removeSignup).toHaveBeenCalledTimes(signups.length);
      expect(discordService.deleteMessage).toHaveBeenCalledTimes(
        signups.length,
      );
      expect(discordService.getTextChannel).toHaveBeenCalled();
    });
  });
});
