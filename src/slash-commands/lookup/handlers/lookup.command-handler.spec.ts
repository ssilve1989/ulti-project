import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { ErrorService } from '../../../error/error.service.js';
import { BlacklistCollection } from '../../../firebase/collections/blacklist-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import { LookupCommand } from '../commands/lookup.command.js';
import { LookupCommandHandler } from './lookup.command-handler.js';

describe('LookupCommandHandler', () => {
  let handler: LookupCommandHandler;
  let interaction: DeepMocked<ChatInputCommandInteraction<'cached' | 'raw'>>;
  let signupsCollection: DeepMocked<SignupCollection>;
  let blacklistCollection: DeepMocked<BlacklistCollection>;
  let errorService: DeepMocked<ErrorService>;
  const getStringMock = vi.fn();

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [LookupCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(LookupCommandHandler);
    signupsCollection = fixture.get(SignupCollection);
    blacklistCollection = fixture.get(BlacklistCollection);
    errorService = fixture.get(ErrorService);

    interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>({
      options: {
        getString: getStringMock,
      },
      valueOf: () => '',
    });
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
      } as SignupDocument,
    ];

    getStringMock.mockImplementation((key) => {
      if (key === 'character') return 'Aeo Arcanist';
      if (key === 'world') return 'Jenova';
      return null;
    });

    signupsCollection.findAll.mockResolvedValue(signups);

    // Return null so the user is not blacklisted
    blacklistCollection.search.mockResolvedValue(null);

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
    const mockErrorEmbed = createMock<EmbedBuilder>();

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
