import { Test } from '@nestjs/testing';
import { RemoveSignupCommandHandler } from './remove-signup-command.handler.js';
import { DeepMocked, createMock } from '@golevelup/ts-jest';
import { SettingsService } from '../../../settings/settings.service.js';
import { ChatInputCommandInteraction, User } from 'discord.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupRepository } from '../../signup.repository.js';
import { SheetsService } from '../../../sheets/sheets.service.js';

describe('Remove Signup Command Handler', () => {
  let discordService: DeepMocked<DiscordService>;
  let handler: RemoveSignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let settingsService: DeepMocked<SettingsService>;
  let sheetsService: DeepMocked<SheetsService>;
  let signupsRepository: DeepMocked<SignupRepository>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveSignupCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    discordService = fixture.get(DiscordService);
    handler = fixture.get(RemoveSignupCommandHandler);
    settingsService = fixture.get(SettingsService);
    sheetsService = fixture.get(SheetsService);
    signupsRepository = fixture.get(SignupRepository);

    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>({
      member: {
        user: createMock<User>({ id: '1', toString: () => '<@1>' }),
      },
      options: createMock({}),
      valueOf: () => '',
    });
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it('replies with missing settings if no settings are set', async () => {
    settingsService.getSettings.mockResolvedValue(undefined);

    await handler.execute({ interaction });
    expect(interaction.editReply).toHaveBeenCalledWith(
      SIGNUP_MESSAGES.MISSING_SETTINGS,
    );
  });

  it('checks if the user role is allowed to remove signups', async () => {
    settingsService.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    discordService.userHasRole.mockResolvedValue(false);

    await handler.execute({ interaction });
    expect(interaction.editReply).toHaveBeenCalledWith(
      'You do not have permission to remove signups',
    );
  });

  it('replies with missing role if no role is set', async () => {
    settingsService.getSettings.mockResolvedValue({
      reviewChannel: '1234',
    });

    await handler.execute({ interaction });
    expect(interaction.editReply).toHaveBeenCalledWith(
      'No role has been configured to be allowed to run this command.',
    );
  });

  it('removes the signup from the spreadsheet', async () => {
    settingsService.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    await handler.execute({ interaction });
    expect(signupsRepository.removeSignup).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith('Signup removed');
  });

  it('calls removeSignup from SheetService if spreadsheetId is set', async () => {
    settingsService.getSettings.mockResolvedValue({
      spreadsheetId: '1234',
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).toHaveBeenCalled();
  });
});
