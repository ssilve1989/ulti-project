import { createMock } from '@golevelup/ts-vitest';
import type { DeepMocked } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SearchCommandHandler } from './search.command-handler.js';
import { SearchCommand } from './search.command.js';
import {
  ENCOUNTER_SELECT_ID,
  PROG_POINT_SELECT_ID,
  RESET_BUTTON_ID,
} from './search.components.js';

describe('SearchCommandHandler', () => {
  let handler: SearchCommandHandler;
  let mockSignupsCollection: DeepMocked<SignupCollection>;
  let mockConfigService: DeepMocked<ConfigService>;
  let mockInteraction: DeepMocked<ChatInputCommandInteraction>;
  let mockCollector: any; // Using 'any' to avoid complex typing issues
  let mockReplyMessage: any;

  beforeEach(async () => {
    mockSignupsCollection = createMock<SignupCollection>();
    mockConfigService = createMock<ConfigService>();
    mockInteraction = createMock<ChatInputCommandInteraction>();

    // Configure config service to return application mode
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'APPLICATION_MODE') {
        return ['ultimate']; // Default test mode
      }
      return undefined;
    });

    // Force the interaction to have the right cache type
    Object.defineProperty(mockInteraction, '_cacheType', {
      value: 'cached',
      writable: true,
    });

    // Create a simple mock collector
    mockCollector = {
      on: vi.fn().mockReturnThis(),
    };

    mockReplyMessage = {
      createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
    };

    mockInteraction.editReply.mockResolvedValue(mockReplyMessage);
    mockInteraction.user = { id: 'user123', username: 'testuser' } as any;
    mockInteraction.guildId = 'guild123';

    const module = await Test.createTestingModule({
      providers: [
        SearchCommandHandler,
        { provide: SignupCollection, useValue: mockSignupsCollection },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    handler = module.get<SearchCommandHandler>(SearchCommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should create initial embed with encounter select menu', async () => {
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );

    // Mock the editReply response with a proper structure
    mockInteraction.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: 'Select an encounter to begin your search',
          },
        ],
        components: [{ type: 1, components: [] }],
        createMessageComponentCollector:
          mockReplyMessage.createMessageComponentCollector,
      } as any);
    });

    await handler.execute(command);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({
      ephemeral: true,
    });

    // Use a simpler assertion that just checks key properties
    expect(mockInteraction.editReply).toHaveBeenCalled();
    const editReplyArg = mockInteraction.editReply.mock.calls[0][0];
    expect(editReplyArg).toHaveProperty('embeds');
    expect(editReplyArg).toHaveProperty('components');
  });

  it('should handle encounter selection and show prog point menu', async () => {
    // Setup the collector to simulate a user selecting an encounter
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // Mock the editReply responses with proper structures
    mockInteraction.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: 'Select an encounter to begin your search',
          },
        ],
        components: [{ type: 1, components: [] }],
        createMessageComponentCollector:
          mockReplyMessage.createMessageComponentCollector,
      } as any);
    });

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // Create a mock select menu interaction for encounter selection
    const mockSelectInteraction = createMock<StringSelectMenuInteraction>();
    mockSelectInteraction.customId = ENCOUNTER_SELECT_ID;
    mockSelectInteraction.values = [Encounter.TOP];
    mockSelectInteraction.isStringSelectMenu.mockReturnValue(true);

    // Mock the editReply for the selection interaction
    mockSelectInteraction.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: `Selected encounter: ${Encounter.TOP}\nNow select a prog point`,
          },
        ],
        components: [
          { type: 1, components: [] }, // Prog point select
          { type: 1, components: [] }, // Reset button
        ],
      } as any);
    });

    // Simulate the interaction
    await collectorCallback!(mockSelectInteraction);

    // Verify the response
    expect(mockSelectInteraction.deferUpdate).toHaveBeenCalled();
    expect(mockSelectInteraction.editReply).toHaveBeenCalled();
  });

  it('should handle prog point selection and show search results', async () => {
    // Setup the collector
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // Mock search results with separate character and world fields
    const mockSignups = [
      {
        character: 'TestChar',
        world: 'TestWorld',
        role: 'Tank',
        availability: 'Weekends',
        discordId: 'user123',
        notes: 'Test notes',
        username: 'testuser',
      },
    ];
    mockSignupsCollection.findAll.mockResolvedValue(mockSignups);

    // Mock the editReply responses
    mockInteraction.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: 'Select an encounter to begin your search',
          },
        ],
        components: [{ type: 1, components: [] }],
        createMessageComponentCollector:
          mockReplyMessage.createMessageComponentCollector,
      } as any);
    });

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // First, simulate encounter selection
    const mockEncounterSelect = createMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = ENCOUNTER_SELECT_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);

    mockEncounterSelect.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: `Selected encounter: ${Encounter.TOP}\nNow select a prog point`,
          },
        ],
        components: [
          { type: 1, components: [] },
          { type: 1, components: [] },
        ],
      } as any);
    });

    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection
    const mockProgPointSelect = createMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    mockProgPointSelect.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Results',
            description: `Found ${mockSignups.length} player(s) for **${Encounter.TOP}** at prog point: **P6 Enrage**\nPage 1/2`,
            fields: mockSignups.slice(0, 8).flatMap((signup) => [
              {
                name: 'Character',
                value: signup.character,
                inline: true,
              },
              {
                name: 'Discord',
                value: `<@${signup.discordId}> (${signup.username})`,
                inline: true,
              },
              {
                name: 'Role',
                value: signup.role,
                inline: true,
              },
            ]),
          },
          {
            title: 'Search Results',
            description: `Found ${mockSignups.length} player(s) for **${Encounter.TOP}** at prog point: **P6 Enrage**\nPage 2/2`,
            fields: mockSignups.slice(8).flatMap((signup) => [
              {
                name: 'Character',
                value: signup.character,
                inline: true,
              },
              {
                name: 'Discord',
                value: `<@${signup.discordId}> (${signup.username})`,
                inline: true,
              },
              {
                name: 'Role',
                value: signup.role,
                inline: true,
              },
            ]),
          },
        ],
        components: [{ type: 1, components: [] }],
      } as any);
    });

    await collectorCallback!(mockProgPointSelect);

    // Verify the search was performed
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'P6 Enrage',
    });

    // Verify the response
    expect(mockProgPointSelect.editReply).toHaveBeenCalled();
  });

  it('should handle pagination when there are more than 8 players', async () => {
    // Setup the collector
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // Create 10 mock signups (which should create 2 pages)
    const mockSignups = Array.from({ length: 10 }, (_, i) => ({
      character: `TestChar${i + 1}`,
      world: 'TestWorld',
      role: 'Tank',
      availability: 'Weekends',
      discordId: `user${i + 1}`,
      notes: 'Test notes',
      username: `testuser${i + 1}`,
    }));
    mockSignupsCollection.findAll.mockResolvedValue(mockSignups);

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // First, simulate encounter selection
    const mockEncounterSelect = createMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = ENCOUNTER_SELECT_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection
    const mockProgPointSelect = createMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    await collectorCallback!(mockProgPointSelect);

    // Verify the search was performed
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'P6 Enrage',
    });

    // Verify the response contains multiple embeds
    expect(mockProgPointSelect.editReply).toHaveBeenCalled();
    const editReplyCall = mockProgPointSelect.editReply.mock.calls[0][0];
    expect(editReplyCall).toHaveProperty('embeds');
    expect(editReplyCall.embeds).toHaveLength(2); // Should have 2 pages

    // Verify first page
    const firstEmbed = editReplyCall.embeds[0];
    expect(firstEmbed.data).toHaveProperty('description');
    expect(firstEmbed.data.description).toContain('Found 10 player(s)');
    expect(firstEmbed.data.description).toContain('Page 1/2');
    expect(firstEmbed.data.fields).toHaveLength(24); // 8 players * 3 fields each

    // Verify second page
    const secondEmbed = editReplyCall.embeds[1];
    expect(secondEmbed.data).toHaveProperty('description');
    expect(secondEmbed.data.description).toContain('Found 10 player(s)');
    expect(secondEmbed.data.description).toContain('Page 2/2');
    expect(secondEmbed.data.fields).toHaveLength(6); // 2 players * 3 fields each
  });

  it('should handle reset button and return to initial state', async () => {
    // Setup the collector
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // Mock the editReply responses
    mockInteraction.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: 'Select an encounter to begin your search',
          },
        ],
        components: [{ type: 1, components: [] }],
        createMessageComponentCollector:
          mockReplyMessage.createMessageComponentCollector,
      } as any);
    });

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // Simulate reset button click
    const mockButtonInteraction = createMock<ButtonInteraction>();
    mockButtonInteraction.customId = RESET_BUTTON_ID;

    mockButtonInteraction.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Signups',
            description: 'Select an encounter to begin your search',
          },
        ],
        components: [{ type: 1, components: [] }],
      } as any);
    });

    await collectorCallback!(mockButtonInteraction);

    // Verify the response returns to initial state
    expect(mockButtonInteraction.deferUpdate).toHaveBeenCalled();
    expect(mockButtonInteraction.editReply).toHaveBeenCalled();
  });

  it('should handle collector end event', async () => {
    // Setup the collector
    let endCallback: () => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'end') {
        endCallback = callback;
      }
      return mockCollector;
    });

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // Simulate the collector ending
    await endCallback!();

    // Verify the response
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content:
        'Search session has expired. Please run the command again if needed.',
      components: [],
    });
  });
});
