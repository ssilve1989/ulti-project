import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Colors, User } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { DocumentNotFoundException } from '../../../firebase/firebase.exceptions.js';
import {
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { SIGNUP_MESSAGES } from '../../signup.consts.js';
import { RemoveSignupCommandHandler } from './remove-signup.command-handler.js';
import {
  REMOVAL_MISSING_PERMISSIONS,
  REMOVAL_NO_DB_ENTRY,
  REMOVAL_SUCCESS,
} from './remove-signup.consts.js';

const fieldExpectations = [
  {
    name: 'Encounter',
    value: EncounterFriendlyDescription[Encounter.DSR],
    inline: true,
  },
  { name: 'Character', value: 'Test Character', inline: true },
  { name: 'World', value: 'Test World', inline: true },
];

const DEFAULT_SETTINGS = {
  spreadsheetId: '1234',
  reviewerRole: 'reviewer',
  reviewChannel: '1234',
};

describe('Remove Signup Command Handler', () => {
  let discordService: DeepMocked<DiscordService>;
  let eventBus: DeepMocked<EventBus>;
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
    eventBus = fixture.get(EventBus);

    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>({
      user: createMock<User>({
        id: '1',
        toString: () => '<@1>',
        valueOf: () => '',
      }),
      options: {
        getString: (key: string) => {
          switch (key) {
            case 'character':
              return 'Test Character';
            case 'encounter':
              return Encounter.DSR;
            case 'world':
              return 'Test World';
            default:
              return '';
          }
        },
      },
      valueOf: () => '',
    });
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it.each([
    {
      case: 'No Settings Configured',
      color: Colors.Red,
      description: SIGNUP_MESSAGES.MISSING_SETTINGS,
      publish: false,
    },
    {
      case: 'Role Not Allowed',
      color: Colors.Red,
      description: REMOVAL_MISSING_PERMISSIONS,
      hasRole: false,
      settings: DEFAULT_SETTINGS,
    },
    {
      case: 'User Not Allowed',
      color: Colors.Red,
      description: REMOVAL_MISSING_PERMISSIONS,
      hasRole: false,
      settings: DEFAULT_SETTINGS,
      signup: { discordId: '2' },
    },
    {
      case: 'Role Removes Successfully',
      color: Colors.Green,
      hasRole: true,
      description: REMOVAL_SUCCESS,
      settings: DEFAULT_SETTINGS,
    },
    {
      case: 'User Removes Successfully',
      color: Colors.Green,
      description: REMOVAL_SUCCESS,
      settings: DEFAULT_SETTINGS,
      hasRole: false,
      signup: { discordId: '1' },
    },
    {
      case: 'Handles DocumentNotFoundException',
      color: Colors.Red,
      description: REMOVAL_NO_DB_ENTRY,
      settings: DEFAULT_SETTINGS,
      signup: new DocumentNotFoundException(),
    },
  ])(
    '$case',
    async ({
      settings,
      hasRole = true,
      color,
      description,
      signup = {},
      publish,
    }) => {
      settingsCollection.getSettings.mockResolvedValueOnce(settings);
      discordService.userHasRole.mockResolvedValue(hasRole);

      if (signup instanceof DocumentNotFoundException) {
        signupsCollection.findOneOrFail.mockRejectedValue(signup);
      } else {
        signupsCollection.findOne.mockResolvedValue(
          createMock<SignupDocument>(signup),
        );
        signupsCollection.findOneOrFail.mockResolvedValueOnce(
          createMock<SignupDocument>(signup),
        );
      }

      await handler.execute({ interaction });

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [
          {
            data: {
              title: 'Remove Signup',
              color,
              description,
              fields: fieldExpectations,
            },
          },
        ],
      });

      if (publish !== false) {
        expect(eventBus.publish).toHaveBeenCalled();
      }
    },
  );

  it('calls removeSignup from SheetService if spreadsheetId is set and signup has been approved', async () => {
    settingsCollection.getSettings.mockResolvedValue(DEFAULT_SETTINGS);

    signupsCollection.findOneOrFail.mockResolvedValueOnce(
      createMock<SignupDocument>({
        status: SignupStatus.APPROVED,
      }),
    );

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).toHaveBeenCalled();
  });

  it('does not call removeSignup from SheetService if the signup has not been approved', async () => {
    settingsCollection.getSettings.mockResolvedValue(DEFAULT_SETTINGS);

    signupsCollection.findOneOrFail.mockResolvedValueOnce(
      createMock<SignupDocument>({
        status: SignupStatus.PENDING,
      }),
    );

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).not.toHaveBeenCalled();
  });
});
