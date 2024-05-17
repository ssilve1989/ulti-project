import { Test } from '@nestjs/testing';

import { createMock } from '@golevelup/ts-vitest';
import { SheetsService } from './sheets.service.js';

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
