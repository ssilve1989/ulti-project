import { sheets_v4 } from '@googleapis/sheets';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Encounter } from '../encounters/encounters.consts.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import { sheetsConfig } from './sheets.config.js';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';
import * as sheetsUtils from './sheets.utils.js';
import { TurboProgSheetRanges } from './turbo-prog-sheets/turbo-prog-sheets.consts.js';

// Define regex patterns at top level for better performance
const TURBO_PROG_RANGE_PATTERN = /TurboProg!A\d+:D/;

vi.mock('@googleapis/sheets', () => ({
  sheets_v4: {},
  sheets: {
    spreadsheets: {
      get: vi.fn(),
      batchUpdate: vi.fn(),
      values: {
        get: vi.fn(),
        update: vi.fn(),
      },
    },
  },
}));

describe('Sheets Service', () => {
  let service: SheetsService;
  let client: sheets_v4.Sheets;
  const mockConfigService = {
    get: vi.fn((key) => {
      if (key === 'sheets') {
        return {
          TURBO_PROG_SHEET_NAME: 'TurboProg',
        };
      }
    }),
  };

  beforeEach(async () => {
    const { sheets } = await import('@googleapis/sheets');

    const fixture = await Test.createTestingModule({
      providers: [
        SheetsService,
        { provide: SHEETS_CLIENT, useValue: sheets },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: sheetsConfig.KEY,
          useValue: { TURBO_PROG_SHEET_NAME: 'TurboProg' },
        },
      ],
    }).compile();

    service = fixture.get(SheetsService);
    client = fixture.get(SHEETS_CLIENT);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('#getSheetMetadata', () => {
    it('returns deleted sheet if the request returns 404', () => {
      const spy = vi.spyOn(client.spreadsheets, 'get');
      spy.mockRejectedValueOnce({ code: 404 });

      return expect(
        service.getSheetMetadata('rando banana'),
      ).resolves.toMatchObject({
        title: 'Deleted Spreadsheet',
      });
    });

    it('returns sheet title and URL when sheet exists', async () => {
      const spy = vi.spyOn(client.spreadsheets, 'get');
      // Cast the mock response to any to avoid type errors
      spy.mockResolvedValueOnce({
        data: {
          properties: {
            title: 'Test Spreadsheet',
          },
        },
      } as any);

      const result = await service.getSheetMetadata('test-id');
      expect(result).toMatchObject({
        title: 'Test Spreadsheet',
        url: expect.stringContaining('test-id'),
      });
    });
  });

  describe('#batchRemoveClearedSignups', () => {
    it('should not call batchUpdate when no requests are generated', async () => {
      // Mock getSheetIdByName to return a valid sheet ID
      vi.spyOn(sheetsUtils, 'getSheetIdByName').mockResolvedValue(123);

      // Mock batchUpdate to track if it's called
      const batchUpdateSpy = vi.spyOn(sheetsUtils, 'batchUpdate');

      // Spy on the private method getRemoveRequestsForRange
      // Return an empty array [] for each call, not an array of empty arrays
      const getRemoveRequestsForRangeSpy = vi
        .spyOn(service as any, 'getRemoveRequestsForRange')
        .mockResolvedValue([]);

      const testSignups = [
        { character: 'TestChar', world: 'TestWorld' },
        { character: 'AnotherChar', world: 'AnotherWorld' },
      ];

      await service.batchRemoveClearedSignups(testSignups, {
        encounter: Encounter.DSR,
        spreadsheetId: 'test-sheet-id',
        partyTypes: [PartyStatus.ClearParty, PartyStatus.ProgParty],
      });

      // Verify getRemoveRequestsForRange was called for each party type
      expect(getRemoveRequestsForRangeSpy).toHaveBeenCalledTimes(2);

      // Verify batchUpdate was not called since flattenedRequests is empty
      expect(batchUpdateSpy).not.toHaveBeenCalled();
    });

    it('should call batchUpdate when requests are generated', async () => {
      // Mock getSheetIdByName to return a valid sheet ID
      vi.spyOn(sheetsUtils, 'getSheetIdByName').mockResolvedValue(123);

      // Mock batchUpdate
      const batchUpdateSpy = vi
        .spyOn(sheetsUtils, 'batchUpdate')
        .mockResolvedValue({} as any);

      // Return a non-empty array of requests
      const mockRequest = { updateCells: { range: { sheetId: 123 } } };
      const getRemoveRequestsForRangeSpy = vi
        .spyOn(service as any, 'getRemoveRequestsForRange')
        .mockResolvedValue([mockRequest]);

      const testSignups = [{ character: 'TestChar', world: 'TestWorld' }];

      await service.batchRemoveClearedSignups(testSignups, {
        encounter: Encounter.DSR,
        spreadsheetId: 'test-sheet-id',
        partyTypes: [PartyStatus.ClearParty],
      });

      // Verify batchUpdate was called with the correct parameters
      expect(batchUpdateSpy).toHaveBeenCalledWith(client, 'test-sheet-id', [
        mockRequest,
      ]);
    });
  });

  // Tests for TurboProg functionality (consolidated from TurboProgSheetsService)
  describe('#upsertTurboProgEntry', () => {
    it('should queue and execute the upsert operation', async () => {
      // Mock the private method that does the actual work
      const upsertTurboProgRowSpy = vi
        .spyOn(service as any, 'upsertTurboProgRow')
        .mockResolvedValue(undefined);

      const mockEntry = {
        character: 'TestChar',
        job: 'WAR',
        progPoint: 'P1',
        availability: 'Weekends',
        encounter: Encounter.DSR,
      };

      await service.upsertTurboProgEntry(mockEntry, 'test-spreadsheet-id');

      // Verify the private method was called with the correct parameters
      expect(upsertTurboProgRowSpy).toHaveBeenCalledWith(
        mockEntry,
        'test-spreadsheet-id',
      );
    });
  });

  describe('#removeTurboProgEntry', () => {
    it('should skip if encounter does not support TurboProg', async () => {
      // Mock an encounter that doesn't have a range defined
      const mockEncounter = 'UNSUPPORTED' as Encounter;

      // Mock findCharacterRowIndex - should not be called
      const findCharacterRowIndexSpy = vi.spyOn(
        sheetsUtils,
        'findCharacterRowIndex',
      );

      await service.removeTurboProgEntry(
        {
          encounter: mockEncounter,
          character: 'TestChar',
        },
        'test-spreadsheet-id',
      );

      // Verify findCharacterRowIndex was not called
      expect(findCharacterRowIndexSpy).not.toHaveBeenCalled();
    });

    it('should remove an entry when found', async () => {
      // Mock the TurboProgSheetRanges
      const mockRange = { start: 'A', end: 'D' };
      const originalRanges = { ...TurboProgSheetRanges };
      (TurboProgSheetRanges as any)[Encounter.DSR] = mockRange;

      // Mock findCharacterRowIndex to return a row
      vi.spyOn(sheetsUtils, 'findCharacterRowIndex').mockResolvedValue({
        rowIndex: 5,
        sheetValues: [['TestChar', 'WAR', 'P1', 'Weekends']],
      });

      // Mock getSheetIdByName
      vi.spyOn(sheetsUtils, 'getSheetIdByName').mockResolvedValue(456);

      // Spy on batchUpdate
      const batchUpdateSpy = vi
        .spyOn(client.spreadsheets, 'batchUpdate')
        .mockResolvedValue({} as any);

      await service.removeTurboProgEntry(
        {
          encounter: Encounter.DSR,
          character: 'TestChar',
        },
        'test-spreadsheet-id',
      );

      // Verify batchUpdate was called with the correct parameters
      expect(batchUpdateSpy).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet-id',
        requestBody: {
          requests: [
            expect.objectContaining({
              updateCells: expect.objectContaining({
                range: expect.objectContaining({
                  sheetId: 456,
                  startRowIndex: 5,
                  endRowIndex: 6,
                }),
              }),
            }),
          ],
        },
      });

      // Restore the original TurboProgSheetRanges
      Object.assign(TurboProgSheetRanges, originalRanges);
    });

    it('should do nothing if entry not found', async () => {
      // Mock the TurboProgSheetRanges
      const mockRange = { start: 'A', end: 'D' };
      const originalRanges = { ...TurboProgSheetRanges };
      (TurboProgSheetRanges as any)[Encounter.DSR] = mockRange;

      // Mock findCharacterRowIndex to return -1 (not found)
      vi.spyOn(sheetsUtils, 'findCharacterRowIndex').mockResolvedValue({
        rowIndex: -1,
        sheetValues: [],
      });

      // Spy on batchUpdate
      const batchUpdateSpy = vi.spyOn(client.spreadsheets, 'batchUpdate');

      await service.removeTurboProgEntry(
        {
          encounter: Encounter.DSR,
          character: 'NonExistentChar',
        },
        'test-spreadsheet-id',
      );

      // Verify batchUpdate was not called
      expect(batchUpdateSpy).not.toHaveBeenCalled();

      // Restore the original TurboProgSheetRanges
      Object.assign(TurboProgSheetRanges, originalRanges);
    });
  });

  // Test coverage for private method upsertTurboProgRow through the public method
  describe('upsertTurboProgRow (via upsertTurboProgEntry)', () => {
    it('should update an existing row when found', async () => {
      // Mock the TurboProgSheetRanges
      const mockRange = { start: 'A', end: 'D' };
      const originalRanges = { ...TurboProgSheetRanges };
      (TurboProgSheetRanges as any)[Encounter.DSR] = mockRange;

      // Mock findCharacterRowIndex to return a row
      vi.spyOn(sheetsUtils, 'findCharacterRowIndex').mockResolvedValue({
        rowIndex: 3,
        sheetValues: [['TestChar', 'WAR', 'P1', 'Weekends']],
      });

      // Mock updateSheet
      const updateSheetSpy = vi
        .spyOn(sheetsUtils, 'updateSheet')
        .mockResolvedValue({} as any);

      const mockEntry = {
        character: 'TestChar',
        job: 'WAR',
        progPoint: 'P2',
        availability: 'Evenings',
        encounter: Encounter.DSR,
      };

      await service.upsertTurboProgEntry(mockEntry, 'test-spreadsheet-id');

      // Verify updateSheet was called with correct arguments for updating existing row
      expect(updateSheetSpy).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          spreadsheetId: 'test-spreadsheet-id',
          range: 'TurboProg!A4:D4', // row + 1 as index starts at 0
          values: [['TestChar', 'WAR', 'P2', 'Evenings']],
          type: 'update',
        }),
      );

      // Restore the original TurboProgSheetRanges
      Object.assign(TurboProgSheetRanges, originalRanges);
    });

    it('should add a new row when entry not found', async () => {
      // Mock the TurboProgSheetRanges
      const mockRange = { start: 'A', end: 'D' };
      const originalRanges = { ...TurboProgSheetRanges };
      (TurboProgSheetRanges as any)[Encounter.DSR] = mockRange;

      // Mock findCharacterRowIndex to return not found
      vi.spyOn(sheetsUtils, 'findCharacterRowIndex').mockResolvedValue({
        rowIndex: -1,
        sheetValues: [['ExistingChar', 'PLD', 'P1', 'Weekends']], // One existing row
      });

      // Mock updateSheet
      const updateSheetSpy = vi
        .spyOn(sheetsUtils, 'updateSheet')
        .mockResolvedValue({} as any);

      const mockEntry = {
        character: 'NewChar',
        job: 'DRG',
        progPoint: 'P1',
        availability: 'Weekends',
        encounter: Encounter.DSR,
      };

      await service.upsertTurboProgEntry(mockEntry, 'test-spreadsheet-id');

      // Verify updateSheet was called with correct arguments for adding a new row
      // Should use sheetValues.length + 1 for the new row
      expect(updateSheetSpy).toHaveBeenCalledWith(
        client,
        expect.objectContaining({
          spreadsheetId: 'test-spreadsheet-id',
          range: expect.stringMatching(TURBO_PROG_RANGE_PATTERN), // Using pre-defined regex pattern
          values: [['NewChar', 'DRG', 'P1', 'Weekends']],
          type: 'update',
        }),
      );

      // Restore the original TurboProgSheetRanges
      Object.assign(TurboProgSheetRanges, originalRanges);
    });
  });
});
