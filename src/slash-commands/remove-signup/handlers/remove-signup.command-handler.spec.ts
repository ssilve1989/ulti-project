import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Colors, User } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { SIGNUP_MESSAGES } from '../../signup/signup.consts.js';
import {
  REMOVAL_MISSING_PERMISSIONS,
  REMOVAL_NO_DB_ENTRY,
  REMOVAL_SUCCESS,
} from '../remove-signup.consts.js';
import { RemoveSignupCommandHandler } from './remove-signup.command-handler.js';

const fieldExpectations = [
  {
    name: 'Encounter',
    value: EncounterFriendlyDescription[Encounter.DSR],
    inline: true,
  },
  { name: 'Character', value: 'Test Character', inline: true },
  { name: 'World', value: 'Jenova', inline: true },
];

const DEFAULT_SETTINGS = {
  spreadsheetId: '1234',
  reviewerRole: 'reviewer',
  reviewChannel: '1234',
};

describe('Remove Signup Command Handler', () => {
  let discordService: any;
  let eventBus: any;
  let handler: RemoveSignupCommandHandler;
  let interaction: any;
  let settingsCollection: any;
  let sheetsService: any;
  let signupsCollection: any;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [RemoveSignupCommandHandler],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
      .compile();

    discordService = fixture.get(DiscordService);
    handler = fixture.get(RemoveSignupCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    sheetsService = fixture.get(SheetsService);
    signupsCollection = fixture.get(SignupCollection);
    eventBus = fixture.get(EventBus);

    interaction = {
      user: {
        id: '1',
        toString: () => '<@1>',
        valueOf: () => '',
      },
      options: {
        getString: (key: string) => {
          switch (key) {
            case 'character':
              return 'Test Character';
            case 'encounter':
              return Encounter.DSR;
            case 'world':
              return 'Jenova';
            default:
              return '';
          }
        },
      },
      valueOf: () => '',
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as any;
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
          signup as SignupDocument,
        );
        signupsCollection.findOneOrFail.mockResolvedValueOnce(
          signup as SignupDocument,
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
    discordService.userHasRole.mockResolvedValue(true);

    signupsCollection.findOneOrFail.mockResolvedValueOnce(
      {
        status: SignupStatus.APPROVED,
      } as SignupDocument,
    );

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).toHaveBeenCalled();
  });

  it('does not call removeSignup from SheetService if the signup has not been approved', async () => {
    settingsCollection.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    discordService.userHasRole.mockResolvedValue(true);

    signupsCollection.findOneOrFail.mockResolvedValueOnce(
      {
        status: SignupStatus.PENDING,
      } as SignupDocument,
    );

    await handler.execute({ interaction });
    expect(sheetsService.removeSignup).not.toHaveBeenCalled();
  });

  it('responds with validation error when invalid world is provided', async () => {
    const invalidWorldInteraction = {
      user: {
        id: '1',
        toString: () => '<@1>',
        valueOf: () => '',
      },
      options: {
        getString: (key: string) => {
          switch (key) {
            case 'character':
              return 'Test Character';
            case 'encounter':
              return Encounter.DSR;
            case 'world':
              return 'InvalidWorld';
            default:
              return '';
          }
        },
      },
      valueOf: () => '',
      deferReply: vi.fn(),
      editReply: vi.fn(),
    } as any;

    await handler.execute({ interaction: invalidWorldInteraction });

    expect(invalidWorldInteraction.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            title: 'Remove Signup - Validation Error',
            color: Colors.Red,
            description:
              '**World**: Invalid World. Please check the spelling and make sure it is a valid world in the NA Region',
          },
        },
      ],
    });
  });
});
