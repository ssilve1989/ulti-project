import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Colors, EmbedBuilder, MessageFlags } from 'discord.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../error/error.service.js';
import { BlacklistCollection } from '../../../firebase/collections/blacklist-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { LookupCommand } from '../commands/lookup.command.js';
import { LookupCommandHandler } from './lookup.command-handler.js';

describe('LookupCommandHandler', () => {
  let handler: LookupCommandHandler;
  let interaction: ChatInputCommandInteraction<'cached'>;
  let signupsCollection: Mocked<SignupCollection>;
  let blacklistCollection: Mocked<BlacklistCollection>;
  let errorService: Mocked<ErrorService>;
  const getStringMock = vi.fn();

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [LookupCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(LookupCommandHandler);
    signupsCollection = fixture.get(SignupCollection);
    blacklistCollection = fixture.get(BlacklistCollection);
    errorService = fixture.get(ErrorService);

    interaction = {
      options: { getString: getStringMock },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction<'cached'>;
  });

  afterEach(() => {
    getStringMock.mockClear();
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should call the lookup service with the correct parameters', async () => {
    const signups: SignupDocument[] = [
      {
        character: 'aeo arcanist',
        world: 'jenova',
        encounter: Encounter.DSR,
        notes: 'Test notes',
        progPoint: 'P6',
      } as SignupDocument,
    ];

    getStringMock.mockImplementation((key) => {
      if (key === 'character') return 'Aeo Arcanist';
      if (key === 'world') return 'Jenova';
      return null;
    });

    signupsCollection.findAll.mockResolvedValue(signups);

    // Return null so the user is not blacklisted
    blacklistCollection.search.mockResolvedValue(null as never);

    const command = new LookupCommand(interaction);

    await handler.execute(command);

    expect(interaction.reply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
      embeds: [
        EmbedBuilder.from({
          title: 'Lookup Results for Aeo Arcanist @ Jenova',
          color: Colors.Green, // Green color
          fields: [
            {
              name: 'Encounter',
              value: '[DSR] Dragonsong Reprise',
              inline: true,
            },
            {
              name: 'Prog Point',
              value: 'P6',
              inline: true,
            },
            {
              name: '\u200b',
              value: '\u200b',
              inline: true,
            },
            {
              name: 'Blacklisted',
              value: 'No',
              inline: true,
            },
            {
              name: 'Notes',
              value: signups[0].notes!,
              inline: false,
            },
          ],
        }),
      ],
    });
  });

  it('should show no results found message when no signups are found', async () => {
    const signups: SignupDocument[] = [];
    signupsCollection.findAll.mockResolvedValue(signups);

    const command = new LookupCommand(interaction);
    await handler.execute(command);

    expect(interaction.reply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
      embeds: [
        EmbedBuilder.from({
          title: 'Lookup Results',
          description: 'No results found!',
          color: Colors.Red, // Red color
        }),
      ],
    });
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Database error');
    const mockErrorEmbed = {} as EmbedBuilder;

    getStringMock.mockImplementation((key) => {
      if (key === 'character') return 'Test Character';
      if (key === 'world') return 'Jenova';
      return null;
    });

    signupsCollection.findAll.mockRejectedValue(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const command = new LookupCommand(interaction);
    await handler.execute(command);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.reply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
      flags: MessageFlags.Ephemeral,
    });
  });
});
