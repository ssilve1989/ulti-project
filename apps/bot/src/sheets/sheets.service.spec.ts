import { sheets, sheets_v4 } from '@googleapis/sheets';
import { Test } from '@nestjs/testing';
import { Encounter, PartyStatus } from '@ulti-project/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncountersService } from '../encounters/encounters.service.js';
import { ErrorService } from '../error/error.service.js';
import { mockOf } from '../test-utils/mock-factory.js';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';
import * as sheetsUtils from './sheets.utils.js';

vi.mock('@googleapis/sheets', () => ({
  sheets_v4: {},
  sheets: {
    spreadsheets: {
      get: vi.fn(),
      batchUpdate: vi.fn(),
      values: {
        get: vi.fn(),
        batchGet: vi.fn(),
        update: vi.fn(),
      },
    },
  },
}));

describe('Sheets Service', () => {
  let service: SheetsService;
  let client: sheets_v4.Sheets;
  let mockEncountersService: any;
  let mockErrorService: any;

  beforeEach(async () => {
    // Create mock for EncountersService
    mockEncountersService = {
      getProgPoints: vi.fn().mockResolvedValue([
        { id: 'p1', label: 'Phase 1', order: 0 },
        { id: 'p2', label: 'Phase 2', order: 1 },
      ]),
    };

    // Create mock for ErrorService
    mockErrorService = {
      captureError: vi.fn(),
    };

    const fixture = await Test.createTestingModule({
      providers: [
        SheetsService,
        { provide: SHEETS_CLIENT, useValue: sheets },
        { provide: EncountersService, useValue: mockEncountersService },
        { provide: ErrorService, useValue: mockErrorService },
      ],
    }).compile();

    service = fixture.get(SheetsService);
    client = fixture.get(SHEETS_CLIENT);
  });

  // tests stub `sheetsUtils` exports with vi.spyOn; without restoring them, a
  // stub (e.g. getSheetIdByName) leaks into whichever test runs next
  afterEach(() => {
    vi.restoreAllMocks();
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
      spy.mockResolvedValueOnce(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: {
            properties: {
              title: 'Test Spreadsheet',
            },
          },
        }),
      );

      const result = await service.getSheetMetadata('test-id');
      expect(result).toMatchObject({
        title: 'Test Spreadsheet',
        url: expect.stringContaining('test-id'),
      });
    });
  });

  describe('#cleanSheet', () => {
    it('skips cleaning when the sheet tab is hidden', async () => {
      const getSpy = vi.spyOn(client.spreadsheets, 'get');
      getSpy.mockResolvedValueOnce(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: {
            sheets: [{ properties: { hidden: true } }],
          },
        }),
      );
      const batchUpdateSpy = vi.spyOn(client.spreadsheets, 'batchUpdate');

      await service.cleanSheet({
        spreadsheetId: 'test-id',
        encounter: Encounter.TOP,
      });

      expect(mockEncountersService.getProgPoints).not.toHaveBeenCalled();
      expect(batchUpdateSpy).not.toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it('cleans the first tab of the spreadsheet, whose sheet ID is 0', async () => {
      vi.spyOn(client.spreadsheets, 'get').mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: {
            sheets: [
              {
                properties: { sheetId: 0, hidden: false },
                data: [
                  {
                    rowData: [
                      {
                        values: [
                          { userEnteredValue: { stringValue: 'TestChar' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      );
      const batchUpdateSpy = vi
        .spyOn(sheetsUtils, 'batchUpdate')
        .mockResolvedValue(
          mockOf<Awaited<ReturnType<typeof sheetsUtils.batchUpdate>>>({}),
        );

      await service.cleanSheet({
        spreadsheetId: 'test-id',
        encounter: Encounter.TOP,
      });

      expect(batchUpdateSpy).toHaveBeenCalled();
    });
  });

  describe('#removeSignup', () => {
    it('looks the tab up once and clears the character from both sections of a prog encounter', async () => {
      const batchUpdateSpy = vi
        .spyOn(sheetsUtils, 'batchUpdate')
        .mockResolvedValue(
          mockOf<Awaited<ReturnType<typeof sheetsUtils.batchUpdate>>>({}),
        );
      const getSpy = vi.spyOn(client.spreadsheets, 'get');
      getSpy.mockReset();
      getSpy.mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: { sheets: [{ properties: { sheetId: 7, title: 'DSR' } }] },
        }),
      );
      const batchGetSpy = vi.spyOn(client.spreadsheets.values, 'batchGet');
      batchGetSpy.mockReset();
      batchGetSpy.mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.values.batchGet>>>(
          {
            data: {
              valueRanges: [
                {
                  values: [
                    ['Other', 'Server'],
                    ['Me', 'Server'],
                  ],
                },
                { values: [['Me', 'Server']] },
              ],
            },
          },
        ),
      );

      await service.removeSignup(
        { encounter: Encounter.DSR, character: 'Me', world: 'Server' },
        'test-sheet-id',
      );

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(batchGetSpy).toHaveBeenCalledTimes(1);
      expect(batchUpdateSpy).toHaveBeenCalledWith(client, 'test-sheet-id', [
        {
          updateCells: {
            range: {
              sheetId: 7,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: 8,
              endColumnIndex: 12,
            },
            fields: 'userEnteredValue',
          },
        },
        {
          updateCells: {
            range: {
              sheetId: 7,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 2,
              endColumnIndex: 6,
            },
            fields: 'userEnteredValue',
          },
        },
      ]);
    });

    it('returns 0 without touching the sheet when the character is not on it', async () => {
      const batchUpdateSpy = vi.spyOn(sheetsUtils, 'batchUpdate');
      const getSpy = vi.spyOn(client.spreadsheets, 'get');
      getSpy.mockReset();
      const batchGetSpy = vi.spyOn(client.spreadsheets.values, 'batchGet');
      batchGetSpy.mockReset();
      batchGetSpy.mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.values.batchGet>>>(
          { data: { valueRanges: [{ values: [['Other', 'Server']] }, {}] } },
        ),
      );

      const result = await service.removeSignup(
        { encounter: Encounter.DSR, character: 'Me', world: 'Server' },
        'test-sheet-id',
      );

      expect(result).toBe(0);
      expect(getSpy).not.toHaveBeenCalled();
      expect(batchUpdateSpy).not.toHaveBeenCalled();
    });
  });

  describe('#cleanSheet', () => {
    it('writes each section to the tab id returned with its own grid data', async () => {
      const batchUpdateSpy = vi
        .spyOn(sheetsUtils, 'batchUpdate')
        .mockResolvedValue(
          mockOf<Awaited<ReturnType<typeof sheetsUtils.batchUpdate>>>({}),
        );
      const getSpy = vi.spyOn(client.spreadsheets, 'get');
      getSpy.mockReset();
      getSpy.mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: {
            sheets: [
              {
                properties: { sheetId: 7, hidden: false },
                data: [
                  {
                    rowData: [
                      { values: [{ userEnteredValue: { stringValue: 'Me' } }] },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      );

      await service.cleanSheet({
        spreadsheetId: 'test-id',
        encounter: Encounter.TOP,
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(
        batchUpdateSpy.mock.calls.map(([, , requests]) =>
          requests.map((request) => request.updateCells?.range?.sheetId),
        ),
      ).toEqual([[7], [7]]);
    });
  });

  describe('#batchRemoveClearedSignups', () => {
    /** Stubs the tab lookup and what one batchGet returns for each range. */
    function stubSheet({
      sheetId,
      valueRanges,
    }: {
      sheetId: number;
      valueRanges: string[][][];
    }) {
      const getSpy = vi.spyOn(client.spreadsheets, 'get');
      getSpy.mockReset();
      getSpy.mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: { sheets: [{ properties: { sheetId, title: 'DSR' } }] },
        }),
      );
      const batchGetSpy = vi.spyOn(client.spreadsheets.values, 'batchGet');
      batchGetSpy.mockReset();
      batchGetSpy.mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.values.batchGet>>>(
          {
            data: {
              valueRanges: valueRanges.map((values) => ({ values })),
            },
          },
        ),
      );
      const batchUpdateSpy = vi
        .spyOn(sheetsUtils, 'batchUpdate')
        .mockResolvedValue(
          mockOf<Awaited<ReturnType<typeof sheetsUtils.batchUpdate>>>({}),
        );
      return { getSpy, batchGetSpy, batchUpdateSpy };
    }

    const clearCells = (
      sheetId: number,
      row: number,
      startColumnIndex: number,
      endColumnIndex: number,
    ) => ({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: row,
          endRowIndex: row + 1,
          startColumnIndex,
          endColumnIndex,
        },
        fields: 'userEnteredValue',
      },
    });

    it('clears every found signup across all ranges with one read, one tab lookup and one update', async () => {
      const { getSpy, batchGetSpy, batchUpdateSpy } = stubSheet({
        sheetId: 7,
        valueRanges: [
          [
            ['Other', 'Server'],
            ['Me', 'Server'],
          ],
          [
            ['you', 'server'],
            ['Other', 'Server'],
          ],
        ],
      });

      const cleared = await service.batchRemoveClearedSignups(
        [
          { character: 'Me', world: 'Server' },
          { character: 'You', world: 'Server' },
        ],
        {
          encounter: Encounter.DSR,
          spreadsheetId: 'test-sheet-id',
          partyTypes: [PartyStatus.ClearParty, PartyStatus.ProgParty],
        },
      );

      expect(cleared).toBe(2);
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(batchGetSpy).toHaveBeenCalledTimes(1);
      expect(batchUpdateSpy).toHaveBeenCalledTimes(1);
      expect(batchUpdateSpy).toHaveBeenCalledWith(client, 'test-sheet-id', [
        clearCells(7, 1, 2, 6),
        clearCells(7, 0, 8, 12),
      ]);
    });

    it('does nothing and returns 0 when no signup is on the sheet', async () => {
      const { getSpy, batchUpdateSpy } = stubSheet({
        sheetId: 7,
        valueRanges: [[['Other', 'Server']]],
      });

      const cleared = await service.batchRemoveClearedSignups(
        [{ character: 'Me', world: 'Server' }],
        {
          encounter: Encounter.DSR,
          spreadsheetId: 'test-sheet-id',
          partyTypes: [PartyStatus.ClearParty],
        },
      );

      expect(cleared).toBe(0);
      expect(getSpy).not.toHaveBeenCalled();
      expect(batchUpdateSpy).not.toHaveBeenCalled();
    });

    it('removes signups from the first tab of the spreadsheet, whose sheet ID is 0', async () => {
      const { batchUpdateSpy } = stubSheet({
        sheetId: 0,
        valueRanges: [[['Me', 'Server']]],
      });

      await service.batchRemoveClearedSignups(
        [{ character: 'Me', world: 'Server' }],
        {
          encounter: Encounter.DSR,
          spreadsheetId: 'test-sheet-id',
          partyTypes: [PartyStatus.ClearParty],
        },
      );

      expect(batchUpdateSpy).toHaveBeenCalledWith(client, 'test-sheet-id', [
        clearCells(0, 0, 2, 6),
      ]);
    });

    it('throws when the encounter has no tab on the spreadsheet', async () => {
      const { batchUpdateSpy } = stubSheet({
        sheetId: 7,
        valueRanges: [[['Me', 'Server']]],
      });
      vi.spyOn(client.spreadsheets, 'get').mockResolvedValue(
        mockOf<Awaited<ReturnType<typeof client.spreadsheets.get>>>({
          data: { sheets: [] },
        }),
      );

      await expect(
        service.batchRemoveClearedSignups(
          [{ character: 'Me', world: 'Server' }],
          {
            encounter: Encounter.DSR,
            spreadsheetId: 'test-sheet-id',
            partyTypes: [PartyStatus.ClearParty],
          },
        ),
      ).rejects.toThrow(/Invalid SheetID/);
      expect(batchUpdateSpy).not.toHaveBeenCalled();
    });
  });
});
