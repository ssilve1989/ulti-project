import { DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, User } from 'discord.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import {
  SignupDocument,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { RemoveSignupCommandHandler } from './remove-signup.command-handler.js';
import {
  REMOVAL_MISSING_PERMISSIONS,
  REMOVAL_SUCCESS,
} from './remove-signup.consts.js';

describe('Remove Signup Command Handler', () => {
  let discordService: DeepMocked<DiscordService>;
  let handler: RemoveSignupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let settingsCollection: DeepMocked<SettingsCollection>;
  let sheetsService: DeepMocked<SheetsService>;
  let signupsCollection: DeepMocked<SignupCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveSignupCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    discordService = fixture.get(DiscordService);
    handler = fixture.get(RemoveSignupCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    sheetsService = fixture.get(SheetsService);
    signupsCollection = fixture.get(SignupCollection);

    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>({
      user: createMock<User>({
        id: '1',
        toString: () => '<@1>',
        valueOf: () => '',
      }),
      options: {
        getString: () => '',
      },
      valueOf: () => '',
    });
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it('replies with missing settings if no settings are set', async () => {
    settingsCollection.getSettings.mockResolvedValue(undefined);

    await handler.execute({ interaction });
    expect(interaction.editReply).toHaveBeenCalledWith(
      SIGNUP_MESSAGES.MISSING_SETTINGS,
    );
  });

  it('checks if the user role is allowed to remove signups', async () => {
    settingsCollection.getSettings.mockResolvedValue({
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
    settingsCollection.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    await handler.execute({ interaction });
    expect(signupsCollection.removeSignup).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(REMOVAL_SUCCESS);
  });

  it('calls removeSignup from SheetService if spreadsheetId is set and signup has been approved', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      spreadsheetId: '1234',
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    signupsCollection.findOneOrFail.mockResolvedValueOnce(
      createMock<SignupDocument>({
        status: SignupStatus.APPROVED,
      }),
    );

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).toHaveBeenCalled();
  });

  it('does not call removeSignup from SheetService if the signup has not been approved', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      spreadsheetId: '1234',
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    signupsCollection.findOneOrFail.mockResolvedValueOnce(
      createMock<SignupDocument>({
        status: SignupStatus.PENDING,
      }),
    );

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).not.toHaveBeenCalled();
  });

  it('does not allow removal if the userId does not match the signups discordId', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    discordService.userHasRole.mockResolvedValue(false);
    signupsCollection.findOne.mockResolvedValue({ discordId: '2' } as any);

    await handler.execute({ interaction });
    expect(interaction.editReply).toHaveBeenCalledWith(
      REMOVAL_MISSING_PERMISSIONS,
    );
  });

  it('removes the signup if the userId matches the signups discordId', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      reviewerRole: 'reviewer',
      reviewChannel: '1234',
    });

    discordService.userHasRole.mockResolvedValue(false);
    signupsCollection.findOneOrFail.mockResolvedValue({
      discordId: '1',
    } as any);

    await handler.execute({ interaction });
    expect(signupsCollection.removeSignup).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(REMOVAL_SUCCESS);
  });
});
