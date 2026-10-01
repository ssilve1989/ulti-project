import { sheets, sheets_v4 } from '@googleapis/sheets';
import { Test } from '@nestjs/testing';
import { Encounter, PartyStatus } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EncountersService } from '../encounters/encounters.service.js';
import { ErrorService } from '../error/error.service.js';
import { mockOf, withInternals } from '../test-utils/mock-factory.js';
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
        .spyOn(
          withInternals<{
            getRemoveRequestsForRange: (...args: unknown[]) => Promise<unknown>;
          }>(service),
          'getRemoveRequestsForRange',
        )
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
        .mockResolvedValue(
          mockOf<Awaited<ReturnType<typeof sheetsUtils.batchUpdate>>>({}),
        );

      // Return a non-empty array of requests
      const mockRequest = { updateCells: { range: { sheetId: 123 } } };
      vi.spyOn(
        withInternals<{
          getRemoveRequestsForRange: (...args: unknown[]) => Promise<unknown>;
        }>(service),
        'getRemoveRequestsForRange',
      ).mockResolvedValue([mockRequest]);

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
});
