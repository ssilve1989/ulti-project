import type { DeepMocked } from '@golevelup/ts-vitest';
import { createMock } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { EncountersService } from '../../encounters/encounters.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SearchCommand } from './search.command.js';
import { SearchCommandHandler } from './search.command-handler.js';
import {
  SEARCH_ENCOUNTER_SELECTOR_ID,
  SEARCH_PROG_POINT_SELECT_ID,
  SEARCH_RESET_BUTTON_ID,
} from './search.components.js';

describe('SearchCommandHandler', () => {
  let handler: SearchCommandHandler;
  let mockSignupsCollection: DeepMocked<SignupCollection>;
  let mockConfigService: DeepMocked<ConfigService>;
  let mockEncountersService: DeepMocked<EncountersService>;
  let mockInteraction: DeepMocked<ChatInputCommandInteraction>;
  let mockCollector: any; // Using 'any' to avoid complex typing issues
  let mockReplyMessage: any;

  beforeEach(async () => {
    mockSignupsCollection = createMock<SignupCollection>();
    mockConfigService = createMock<ConfigService>();
    mockEncountersService = createMock<EncountersService>();
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

    // Mock EncountersService methods
    mockEncountersService.getProgPoints.mockResolvedValue([
      {
        id: 'P5 Phase 1',
        label: 'P5 Phase 1',
        partyStatus: 'ProgParty',
        order: 0,
        active: true,
      },
      {
        id: 'P6 Enrage',
        label: 'P6 Enrage',
        partyStatus: 'ProgParty',
        order: 1,
        active: true,
      },
      {
        id: 'Clear',
        label: 'Clear',
        partyStatus: 'ClearParty',
        order: 2,
        active: true,
      },
    ]);

    const module = await Test.createTestingModule({
      providers: [
        SearchCommandHandler,
        { provide: SignupCollection, useValue: mockSignupsCollection },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EncountersService, useValue: mockEncountersService },
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
      flags: MessageFlags.Ephemeral,
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
    mockSelectInteraction.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
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
        progPoint: 'P6 Enrage',
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
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
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
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    mockProgPointSelect.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Results',
            description: `Found ${mockSignups.length} player(s) for **${Encounter.TOP}** at prog point: **P6 Enrage or beyond**\nPage 1/2`,
            fields: mockSignups.slice(0, 8).flatMap((signup) => [
              {
                name: 'Character',
                value: `${signup.character} (<@${signup.discordId}>)`,
                inline: true,
              },
              {
                name: 'Role',
                value: signup.role,
                inline: true,
              },
              {
                name: 'Prog Point',
                value: signup.progPoint!,
                inline: true,
              },
            ]),
          },
          {
            title: 'Search Results',
            description: `Found ${mockSignups.length} player(s) for **${Encounter.TOP}** at prog point: **P6 Enrage or beyond**\nPage 2/2`,
            fields: mockSignups.slice(8).flatMap((signup) => [
              {
                name: 'Character',
                value: `${signup.character} (<@${signup.discordId}>)`,
                inline: true,
              },
              {
                name: 'Role',
                value: signup.role,
                inline: true,
              },
              {
                name: 'Prog Point',
                value: signup.progPoint!,
                inline: true,
              },
            ]),
          },
        ],
        components: [{ type: 1, components: [] }],
      } as any);
    });

    await collectorCallback!(mockProgPointSelect);

    // Verify the search was performed for at least the selected prog point
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'P6 Enrage',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'Clear',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledTimes(2);

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

    // Create different signups for different prog points to simulate real behavior
    // where each user can only have one signup per encounter
    const p6SignupsMock = Array.from({ length: 5 }, (_, i) => ({
      character: `P6Char${i + 1}`,
      world: 'TestWorld',
      role: 'Tank',
      availability: 'Weekends',
      discordId: `p6user${i + 1}`,
      notes: 'Test notes',
      username: `p6testuser${i + 1}`,
      progPoint: 'P6 Enrage',
    }));

    const clearSignupsMock = Array.from({ length: 5 }, (_, i) => ({
      character: `ClearChar${i + 1}`,
      world: 'TestWorld',
      role: 'DPS',
      availability: 'Evenings',
      discordId: `clearuser${i + 1}`,
      notes: 'Test notes',
      username: `cleartestuser${i + 1}`,
      progPoint: 'Clear',
    }));

    // Mock findAll to return different signups based on prog point
    mockSignupsCollection.findAll.mockImplementation(
      ({ progPoint }: { progPoint?: string }) => {
        if (progPoint === 'P6 Enrage') {
          return Promise.resolve(p6SignupsMock);
        }
        if (progPoint === 'Clear') {
          return Promise.resolve(clearSignupsMock);
        }
        return Promise.resolve([]);
      },
    );

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // First, simulate encounter selection
    const mockEncounterSelect = createMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection
    const mockProgPointSelect = createMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    await collectorCallback!(mockProgPointSelect);

    // Verify the search was performed for at least the selected prog point
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'P6 Enrage',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'Clear',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledTimes(2);

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
    mockButtonInteraction.customId = SEARCH_RESET_BUTTON_ID;

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

  it('should search for signups at least at selected prog point', async () => {
    // Setup the collector
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // Mock search results for multiple prog points
    const p6Signups = [
      {
        character: 'P6Player',
        world: 'TestWorld',
        role: 'Tank',
        availability: 'Weekends',
        discordId: 'user1',
        notes: 'P6 prog',
        username: 'p6user',
        progPoint: 'P6 Enrage',
      },
    ];
    const clearSignups = [
      {
        character: 'ClearPlayer',
        world: 'TestWorld',
        role: 'DPS',
        availability: 'Weekends',
        discordId: 'user2',
        notes: 'Clear prog',
        username: 'clearuser',
        progPoint: 'Clear',
      },
    ];

    // Mock findAll to return different results for different prog points
    mockSignupsCollection.findAll.mockImplementation(
      ({ progPoint }: { progPoint: string }) => {
        if (progPoint === 'P6 Enrage') return Promise.resolve(p6Signups);
        if (progPoint === 'Clear') return Promise.resolve(clearSignups);
        return Promise.resolve([]);
      },
    );

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // First, simulate encounter selection
    const mockEncounterSelect = createMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection (selecting P6 Enrage should include P6 Enrage and Clear)
    const mockProgPointSelect = createMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    mockProgPointSelect.editReply.mockImplementation(() => {
      return Promise.resolve({
        embeds: [
          {
            title: 'Search Results',
            description: `Found 2 player(s) for **${Encounter.TOP}** at prog point: **P6 Enrage or beyond**`,
            fields: [
              // P6Player fields
              { name: 'Character', value: 'P6Player (<@user1>)', inline: true },
              { name: 'Role', value: 'Tank', inline: true },
              { name: 'Prog Point', value: 'P6 Enrage', inline: true },
              // ClearPlayer fields
              {
                name: 'Character',
                value: 'ClearPlayer (<@user2>)',
                inline: true,
              },
              { name: 'Role', value: 'DPS', inline: true },
              { name: 'Prog Point', value: 'Clear', inline: true },
            ],
          },
        ],
        components: [{ type: 1, components: [] }],
      } as any);
    });

    await collectorCallback!(mockProgPointSelect);

    // Verify the search was performed for all prog points >= P6 Enrage (order 1)
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'P6 Enrage',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'Clear',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledTimes(2);

    // Verify the response
    expect(mockProgPointSelect.editReply).toHaveBeenCalled();
  });

  it('should search only for selected prog point when it is the highest order', async () => {
    // Setup the collector
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // Mock search results for Clear only
    const clearSignups = [
      {
        character: 'ClearPlayer',
        world: 'TestWorld',
        role: 'Tank',
        availability: 'Weekends',
        discordId: 'user1',
        notes: 'Clear prog',
        username: 'clearuser',
        progPoint: 'Clear',
      },
    ];

    mockSignupsCollection.findAll.mockResolvedValue(clearSignups);

    // Execute the command
    const command = new SearchCommand(
      mockInteraction as unknown as ChatInputCommandInteraction<
        'cached' | 'raw'
      >,
    );
    await handler.execute(command);

    // First, simulate encounter selection
    const mockEncounterSelect = createMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection (selecting Clear should only include Clear)
    const mockProgPointSelect = createMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['Clear'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    await collectorCallback!(mockProgPointSelect);

    // Verify the search was performed only for Clear (highest order)
    expect(mockSignupsCollection.findAll).toHaveBeenCalledWith({
      encounter: Encounter.TOP,
      progPoint: 'Clear',
    });
    expect(mockSignupsCollection.findAll).toHaveBeenCalledTimes(1);

    // Verify the response
    expect(mockProgPointSelect.editReply).toHaveBeenCalled();
  });
});
