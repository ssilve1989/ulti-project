import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  type AutoMockRecord,
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import {
  SEARCH_ENCOUNTER_SELECTOR_ID,
  SEARCH_NEXT_PAGE_BUTTON_ID,
  SEARCH_PREV_PAGE_BUTTON_ID,
  SEARCH_PROG_POINT_SELECT_ID,
  SEARCH_RESET_BUTTON_ID,
} from '../search.components.js';
import { SearchCommandHandler } from './search.command-handler.js';

describe('SearchCommandHandler', () => {
  let handler: SearchCommandHandler;
  let mockSignupsCollection: Mocked<SignupCollection>;
  let mockEncountersService: Mocked<EncountersService>;
  let mockErrorService: Mocked<ErrorService>;
  let mockInteraction: Mocked<ChatInputCommandInteraction<'cached'>>;
  let mockCollector: AutoMockRecord;
  let mockReplyMessage: AutoMockRecord;

  beforeEach(async () => {
    mockSignupsCollection = createAutoMock<SignupCollection>();
    mockEncountersService = createAutoMock<EncountersService>();
    mockErrorService = createAutoMock<ErrorService>();
    mockInteraction = createAutoMock<ChatInputCommandInteraction<'cached'>>();

    mockCollector = createAutoMock();
    mockCollector.on.mockReturnValue(mockCollector);

    mockReplyMessage = createAutoMock();
    mockReplyMessage.createMessageComponentCollector.mockReturnValue(
      mockCollector,
    );

    mockInteraction.editReply.mockResolvedValue(
      mockOf<Message<true>>(mockReplyMessage),
    );
    mockInteraction.user = mockOf<User>({
      id: 'user123',
      username: 'testuser',
    });
    mockInteraction.guildId = 'guild123';

    // Mock EncountersService methods
    mockEncountersService.getProgPointsAsOptions.mockResolvedValue({
      'P5 Phase 1': { label: 'P5 Phase 1', partyStatus: PartyStatus.ProgParty },
      'P6 Enrage': { label: 'P6 Enrage', partyStatus: PartyStatus.ProgParty },
      Clear: { label: 'Clear', partyStatus: PartyStatus.ClearParty },
    });

    mockEncountersService.getProgPoints.mockResolvedValue([
      {
        id: 'P5 Phase 1',
        label: 'P5 Phase 1',
        partyStatus: PartyStatus.ProgParty,
        order: 0,
        active: true,
      },
      {
        id: 'P6 Enrage',
        label: 'P6 Enrage',
        partyStatus: PartyStatus.ProgParty,
        order: 1,
        active: true,
      },
      {
        id: 'Clear',
        label: 'Clear',
        partyStatus: PartyStatus.ClearParty,
        order: 2,
        active: true,
      },
    ]);

    const module = await Test.createTestingModule({
      providers: [
        SearchCommandHandler,
        { provide: SignupCollection, useValue: mockSignupsCollection },
        { provide: EncountersService, useValue: mockEncountersService },
        { provide: ErrorService, useValue: mockErrorService },
      ],
    }).compile();

    handler = module.get<SearchCommandHandler>(SearchCommandHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should create initial embed with encounter select menu', async () => {
    // Mock the editReply response with a proper structure
    mockInteraction.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
          embeds: [
            {
              title: 'Search Signups',
              description: 'Select an encounter to begin your search',
            },
          ],
          components: [{ type: 1, components: [] }],
          createMessageComponentCollector:
            mockReplyMessage.createMessageComponentCollector,
        }),
      );
    });

    await handler.execute(mockInteraction);

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
      return Promise.resolve(
        mockOf<Message<true>>({
          embeds: [
            {
              title: 'Search Signups',
              description: 'Select an encounter to begin your search',
            },
          ],
          components: [{ type: 1, components: [] }],
          createMessageComponentCollector:
            mockReplyMessage.createMessageComponentCollector,
        }),
      );
    });

    // Execute the command
    await handler.execute(mockInteraction);

    // Create a mock select menu interaction for encounter selection
    const mockSelectInteraction = createAutoMock<StringSelectMenuInteraction>();
    mockSelectInteraction.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockSelectInteraction.values = [Encounter.TOP];
    mockSelectInteraction.isStringSelectMenu.mockReturnValue(true);

    // Mock the editReply for the selection interaction
    mockSelectInteraction.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
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
        }),
      );
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
        discordId: 'user123',
        notes: 'Test notes',
        username: 'testuser',
        progPoint: 'P6 Enrage',
      },
    ];
    mockSignupsCollection.findAll.mockResolvedValue(
      partialMock<SignupDocument[]>(mockSignups),
    );

    // Mock the editReply responses
    mockInteraction.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
          embeds: [
            {
              title: 'Search Signups',
              description: 'Select an encounter to begin your search',
            },
          ],
          components: [{ type: 1, components: [] }],
          createMessageComponentCollector:
            mockReplyMessage.createMessageComponentCollector,
        }),
      );
    });

    // Execute the command
    await handler.execute(mockInteraction);

    // First, simulate encounter selection
    const mockEncounterSelect = createAutoMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);

    mockEncounterSelect.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
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
        }),
      );
    });

    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection
    const mockProgPointSelect = createAutoMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    mockProgPointSelect.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
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
        }),
      );
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
      discordId: `p6user${i + 1}`,
      notes: 'Test notes',
      username: `p6testuser${i + 1}`,
      progPoint: 'P6 Enrage',
    }));

    const clearSignupsMock = Array.from({ length: 5 }, (_, i) => ({
      character: `ClearChar${i + 1}`,
      world: 'TestWorld',
      role: 'DPS',
      discordId: `clearuser${i + 1}`,
      notes: 'Test notes',
      username: `cleartestuser${i + 1}`,
      progPoint: 'Clear',
    }));

    // Mock findAll to return different signups based on prog point
    mockSignupsCollection.findAll.mockImplementation(
      ({ progPoint }: { progPoint?: string }) => {
        if (progPoint === 'P6 Enrage') {
          return Promise.resolve(partialMock<SignupDocument[]>(p6SignupsMock));
        }
        if (progPoint === 'Clear') {
          return Promise.resolve(
            partialMock<SignupDocument[]>(clearSignupsMock),
          );
        }
        return Promise.resolve([]);
      },
    );

    // Execute the command
    await handler.execute(mockInteraction);

    // First, simulate encounter selection
    const mockEncounterSelect = createAutoMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection
    const mockProgPointSelect = createAutoMock<StringSelectMenuInteraction>();
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

    // Verify the response contains a single embed for the current page,
    // plus a pagination row, rather than every page crammed into one message
    expect(mockProgPointSelect.editReply).toHaveBeenCalled();
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: asserts the concrete editReply payload shape the handler builds; the mock's own signature is the broad discord.js union
    const editReplyCall = mockProgPointSelect.editReply.mock.calls[0][0] as any;
    expect(editReplyCall).toHaveProperty('embeds');
    expect(editReplyCall.embeds).toHaveLength(1);

    const firstEmbed = editReplyCall.embeds[0];
    expect(firstEmbed.data).toHaveProperty('description');
    expect(firstEmbed.data.description).toContain('Found 10 player(s)');
    expect(firstEmbed.data.description).toContain('Page 1/2');
    expect(firstEmbed.data.fields).toHaveLength(24); // 8 players * 3 fields each

    // reset row + pagination row
    expect(editReplyCall.components).toHaveLength(2);
    const paginationRow = editReplyCall.components[1];
    const [prevButton, nextButton] = paginationRow.components;
    expect(prevButton.data.custom_id).toBe(SEARCH_PREV_PAGE_BUTTON_ID);
    expect(prevButton.data.disabled).toBe(true);
    expect(nextButton.data.custom_id).toBe(SEARCH_NEXT_PAGE_BUTTON_ID);
    expect(nextButton.data.disabled).toBe(false);

    // Clicking Next should render page 2 with the remaining 2 players
    const mockNextPage = createAutoMock<ButtonInteraction>();
    mockNextPage.customId = SEARCH_NEXT_PAGE_BUTTON_ID;

    await collectorCallback!(mockNextPage);

    expect(mockNextPage.editReply).toHaveBeenCalled();
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: asserts the concrete editReply payload shape the handler builds; the mock's own signature is the broad discord.js union
    const nextPageCall = mockNextPage.editReply.mock.calls[0][0] as any;
    expect(nextPageCall.embeds).toHaveLength(1);
    const secondEmbed = nextPageCall.embeds[0];
    expect(secondEmbed.data.description).toContain('Found 10 player(s)');
    expect(secondEmbed.data.description).toContain('Page 2/2');
    expect(secondEmbed.data.fields).toHaveLength(6); // 2 players * 3 fields each

    const secondPaginationRow = nextPageCall.components[1];
    const [prevButton2, nextButton2] = secondPaginationRow.components;
    expect(prevButton2.data.disabled).toBe(false);
    expect(nextButton2.data.disabled).toBe(true);
  });

  it('should not exceed the 10-embed Discord limit when results span more than 10 pages', async () => {
    // Setup the collector
    let collectorCallback: (i: any) => Promise<void>;
    mockCollector.on.mockImplementation((event: string, callback: any) => {
      if (event === 'collect') {
        collectorCallback = callback;
      }
      return mockCollector;
    });

    // 90 signups -> 12 pages of 8 players, which used to overflow the
    // 10-embed-per-message Discord limit when all pages were sent at once
    const manySignups = Array.from({ length: 90 }, (_, i) => ({
      character: `Char${i + 1}`,
      world: 'TestWorld',
      role: 'DPS',
      discordId: `user${i + 1}`,
      notes: '',
      username: `user${i + 1}`,
      progPoint: 'Clear',
    }));

    mockSignupsCollection.findAll.mockImplementation(
      ({ progPoint }: { progPoint?: string }) =>
        progPoint === 'Clear'
          ? Promise.resolve(partialMock<SignupDocument[]>(manySignups))
          : Promise.resolve([]),
    );

    // Execute the command
    await handler.execute(mockInteraction);

    // Simulate encounter + prog point selection (Clear has no eligible
    // higher prog points, so only one findAll call is made)
    const mockEncounterSelect = createAutoMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    const mockProgPointSelect = createAutoMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['Clear'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    await collectorCallback!(mockProgPointSelect);

    // biome-ignore lint/nursery/noUnsafeTypeAssertion: asserts the concrete editReply payload shape the handler builds; the mock's own signature is the broad discord.js union
    const editReplyCall = mockProgPointSelect.editReply.mock.calls[0][0] as any;
    expect(editReplyCall.embeds.length).toBeLessThanOrEqual(10);
    expect(editReplyCall.embeds).toHaveLength(1);
    expect(editReplyCall.embeds[0].data.description).toContain('Page 1/12');

    // Paging all the way to the last page should never exceed 1 embed either
    let lastInteraction:
      | Mocked<StringSelectMenuInteraction>
      | Mocked<ButtonInteraction> = mockProgPointSelect;
    for (let i = 0; i < 11; i++) {
      const mockNext = createAutoMock<ButtonInteraction>();
      mockNext.customId = SEARCH_NEXT_PAGE_BUTTON_ID;
      await collectorCallback!(mockNext);
      lastInteraction = mockNext;
    }

    // biome-ignore lint/nursery/noUnsafeTypeAssertion: asserts the concrete editReply payload shape the handler builds; the mock's own signature is the broad discord.js union
    const lastCall = lastInteraction.editReply.mock.calls[0][0] as any;
    expect(lastCall.embeds).toHaveLength(1);
    expect(lastCall.embeds[0].data.description).toContain('Page 12/12');
    const lastPaginationRow = lastCall.components[1];
    const [, lastNextButton] = lastPaginationRow.components;
    expect(lastNextButton.data.disabled).toBe(true);
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
      return Promise.resolve(
        mockOf<Message<true>>({
          embeds: [
            {
              title: 'Search Signups',
              description: 'Select an encounter to begin your search',
            },
          ],
          components: [{ type: 1, components: [] }],
          createMessageComponentCollector:
            mockReplyMessage.createMessageComponentCollector,
        }),
      );
    });

    // Execute the command
    await handler.execute(mockInteraction);

    // Simulate reset button click
    const mockButtonInteraction = createAutoMock<ButtonInteraction>();
    mockButtonInteraction.customId = SEARCH_RESET_BUTTON_ID;

    mockButtonInteraction.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
          embeds: [
            {
              title: 'Search Signups',
              description: 'Select an encounter to begin your search',
            },
          ],
          components: [{ type: 1, components: [] }],
        }),
      );
    });

    await collectorCallback!(mockButtonInteraction);

    // Verify the response returns to initial state
    expect(mockButtonInteraction.deferUpdate).toHaveBeenCalled();
    expect(mockButtonInteraction.editReply).toHaveBeenCalled();
  });

  it('captures component interaction errors instead of rejecting', async () => {
    let collectorCallback: (i: unknown) => Promise<void>;
    mockCollector.on.mockImplementation(
      (event: string, callback: (i: unknown) => Promise<void>) => {
        if (event === 'collect') {
          collectorCallback = callback;
        }
        return mockCollector;
      },
    );

    await handler.execute(mockInteraction);

    const mockSelectInteraction = createAutoMock<StringSelectMenuInteraction>();
    mockSelectInteraction.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockSelectInteraction.values = [Encounter.TOP];
    mockSelectInteraction.isStringSelectMenu.mockReturnValue(true);
    vi.mocked(mockSelectInteraction.deferUpdate).mockRejectedValueOnce(
      new Error('Unknown interaction'),
    );

    // an unhandled rejection here would crash the bot via the
    // process-level unhandledRejection handler in main.ts
    await expect(
      collectorCallback!(mockSelectInteraction),
    ).resolves.toBeUndefined();
    expect(mockErrorService.captureError).toHaveBeenCalledWith(
      expect.any(Error),
    );
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
    await handler.execute(mockInteraction);

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
        discordId: 'user2',
        notes: 'Clear prog',
        username: 'clearuser',
        progPoint: 'Clear',
      },
    ];

    // Mock findAll to return different results for different prog points
    mockSignupsCollection.findAll.mockImplementation(
      ({ progPoint }: { progPoint?: string }) => {
        if (progPoint === 'P6 Enrage')
          return Promise.resolve(partialMock<SignupDocument[]>(p6Signups));
        if (progPoint === 'Clear')
          return Promise.resolve(partialMock<SignupDocument[]>(clearSignups));
        return Promise.resolve([]);
      },
    );

    // Execute the command
    await handler.execute(mockInteraction);

    // First, simulate encounter selection
    const mockEncounterSelect = createAutoMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection (selecting P6 Enrage should include P6 Enrage and Clear)
    const mockProgPointSelect = createAutoMock<StringSelectMenuInteraction>();
    mockProgPointSelect.customId = SEARCH_PROG_POINT_SELECT_ID;
    mockProgPointSelect.values = ['P6 Enrage'];
    mockProgPointSelect.isStringSelectMenu.mockReturnValue(true);

    mockProgPointSelect.editReply.mockImplementation(() => {
      return Promise.resolve(
        mockOf<Message<true>>({
          embeds: [
            {
              title: 'Search Results',
              description: `Found 2 player(s) for **${Encounter.TOP}** at prog point: **P6 Enrage or beyond**`,
              fields: [
                // P6Player fields
                {
                  name: 'Character',
                  value: 'P6Player (<@user1>)',
                  inline: true,
                },
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
        }),
      );
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
        discordId: 'user1',
        notes: 'Clear prog',
        username: 'clearuser',
        progPoint: 'Clear',
      },
    ];

    mockSignupsCollection.findAll.mockResolvedValue(
      partialMock<SignupDocument[]>(clearSignups),
    );

    // Execute the command
    await handler.execute(mockInteraction);

    // First, simulate encounter selection
    const mockEncounterSelect = createAutoMock<StringSelectMenuInteraction>();
    mockEncounterSelect.customId = SEARCH_ENCOUNTER_SELECTOR_ID;
    mockEncounterSelect.values = [Encounter.TOP];
    mockEncounterSelect.isStringSelectMenu.mockReturnValue(true);
    await collectorCallback!(mockEncounterSelect);

    // Then, simulate prog point selection (selecting Clear should only include Clear)
    const mockProgPointSelect = createAutoMock<StringSelectMenuInteraction>();
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
