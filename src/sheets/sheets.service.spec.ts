import { sheets_v4 } from '@googleapis/sheets';
import { Test } from '@nestjs/testing';
import { Encounter } from '../encounters/encounters.consts.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';
import * as sheetsUtils from './sheets.utils.js';

vi.mock('@googleapis/sheets', () => ({
  sheets_v4: {},
  sheets: {
    spreadsheets: {
      get: vi.fn(),
      batchUpdate: vi.fn(),
    },
  },
}));

describe('Sheets Service', () => {
  let service: SheetsService;
  let client: sheets_v4.Sheets;

  beforeEach(async () => {
    const { sheets } = await import('@googleapis/sheets');
    const fixture = await Test.createTestingModule({
      providers: [SheetsService, { provide: SHEETS_CLIENT, useValue: sheets }],
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
  });
});
