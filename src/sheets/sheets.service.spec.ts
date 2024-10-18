import { sheets_v4 } from '@googleapis/sheets';
import { Test } from '@nestjs/testing';
import { SHEETS_CLIENT } from './sheets.consts.js';
import { SheetsService } from './sheets.service.js';

vi.mock('@googleapis/sheets', () => ({
  sheets_v4: {},
  sheets: {
    spreadsheets: {
      get: vi.fn(),
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

      expect(service.getSheetMetadata('rando banana')).resolves.toMatchObject({
        title: 'Deleted Spreadsheet',
      });
    });
  });
});
