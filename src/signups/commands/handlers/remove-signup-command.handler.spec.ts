import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, User } from 'discord.js';

import { DeepMocked, createMock } from '../../../../test/create-mock.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsService } from '../../../settings/settings.service.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { SignupRepository } from '../../signup.repository.js';
import { RemoveSignupCommandHandler } from './remove-signup-command.handler.js';

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
      user: createMock<User>({ id: '1', toString: () => '<@1>' }),
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
      'You do not have permission to remove this signup',
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

  it('does not allow removal if the userId does not match the signups discordId', async () => {
    settingsService.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    discordService.userHasRole.mockResolvedValue(false);
    signupsRepository.findOne.mockResolvedValue({ discordId: '2' } as any);

    await handler.execute({ interaction });
    expect(interaction.editReply).toHaveBeenCalledWith(
      'You do not have permission to remove this signup',
    );
  });

  it('removes the signup if the userId matches the signups discordId', async () => {
    settingsService.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    discordService.userHasRole.mockResolvedValue(false);
    signupsRepository.findOne.mockResolvedValue({ discordId: '1' } as any);

    await handler.execute({ interaction });
    expect(signupsRepository.removeSignup).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith('Signup removed');
  });
});
