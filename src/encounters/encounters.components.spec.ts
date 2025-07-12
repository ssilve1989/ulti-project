import { Test } from '@nestjs/testing';
import { PartyStatus } from '../firebase/models/signup.model.js';
import { CLEARED_OPTION } from './encounters.components.js';
import { Encounter } from './encounters.consts.js';
import { EncountersService } from './encounters.service.js';
import { EncountersComponentsService } from './encounters-components.service.js';

describe('EncountersComponentsService', () => {
  let service: EncountersComponentsService;
  let mockEncountersService: any;

  beforeEach(async () => {
    mockEncountersService = {
      getProgPoints: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        EncountersComponentsService,
        { provide: EncountersService, useValue: mockEncountersService },
      ],
    }).compile();

    service = module.get<EncountersComponentsService>(
      EncountersComponentsService,
    );
  });

  describe('createProgPointSelectMenu', () => {
    it('should create a select menu with prog points and cleared option', async () => {
      const mockProgPoints = [
        {
          id: 'p1',
          label: 'Phase 1',
          partyStatus: PartyStatus.ProgParty,
          order: 0,
        },
        {
          id: 'p2',
          label: 'Phase 2',
          partyStatus: PartyStatus.ClearParty,
          order: 1,
        },
      ];

      mockEncountersService.getProgPoints.mockResolvedValue(mockProgPoints);

      const menu = await service.createProgPointSelectMenu(Encounter.DSR);

      expect(menu.options).toHaveLength(3); // 2 prog points + cleared option
      expect(menu.options[0].data.label).toBe('Phase 1');
      expect(menu.options[0].data.value).toBe('p1');
      expect(menu.options[1].data.label).toBe('Phase 2');
      expect(menu.options[1].data.value).toBe('p2');
      expect(menu.options[2].data.label).toBe(CLEARED_OPTION.label);
      expect(menu.options[2].data.value).toBe(CLEARED_OPTION.value);
    });
  });

  describe('getProgPointOptions', () => {
    it('should return prog point options with cleared option', async () => {
      const mockProgPoints = [
        {
          id: 'start',
          label: 'Starting Point',
          partyStatus: PartyStatus.EarlyProgParty,
          order: 0,
        },
        {
          id: 'end',
          label: 'Ending Point',
          partyStatus: PartyStatus.ClearParty,
          order: 1,
        },
      ];

      mockEncountersService.getProgPoints.mockResolvedValue(mockProgPoints);

      const options = await service.getProgPointOptions(Encounter.TOP);

      expect(options).toHaveLength(3);
      expect(options).toEqual([
        { label: 'Starting Point', value: 'start' },
        { label: 'Ending Point', value: 'end' },
        CLEARED_OPTION,
      ]);
    });
  });
});
