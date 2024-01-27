import { Test } from '@nestjs/testing';
import { SheetsService } from './sheets.service.js';
import { createMock } from '@golevelup/ts-jest';

describe('Sheets Service', () => {
  let service: SheetsService;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SheetsService],
    })
      .useMocker(() => createMock())
      .compile();

    service = fixture.get(SheetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
