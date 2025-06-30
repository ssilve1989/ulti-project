import { createMock } from '@golevelup/ts-vitest';
import type { DeepMocked } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { EncountersCollection } from '../firebase/collections/encounters-collection.js';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../firebase/models/encounter.model.js';
import { PartyStatus } from '../firebase/models/signup.model.js';
import { EncountersService } from './encounters.service.js';

describe('EncountersService', () => {
  let service: EncountersService;
  let mockEncountersCollection: DeepMocked<EncountersCollection>;

  beforeEach(async () => {
    mockEncountersCollection = createMock<EncountersCollection>();

    const module = await Test.createTestingModule({
      providers: [
        EncountersService,
        { provide: EncountersCollection, useValue: mockEncountersCollection },
      ],
    }).compile();

    service = module.get<EncountersService>(EncountersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPartyStatusForProgPoint', () => {
    const mockProgPoints: ProgPointDocument[] = [
      {
        id: 'early1',
        label: 'Early Point 1',
        partyStatus: PartyStatus.EarlyProgParty,
        order: 0,
        active: true,
      },
      {
        id: 'early2',
        label: 'Early Point 2',
        partyStatus: PartyStatus.EarlyProgParty,
        order: 1,
        active: true,
      },
      {
        id: 'prog1',
        label: 'Prog Point 1',
        partyStatus: PartyStatus.ProgParty,
        order: 2,
        active: true,
      },
      {
        id: 'prog2',
        label: 'Prog Point 2',
        partyStatus: PartyStatus.ProgParty,
        order: 3,
        active: true,
      },
      {
        id: 'clear1',
        label: 'Clear Point 1',
        partyStatus: PartyStatus.ClearParty,
        order: 4,
        active: true,
      },
      {
        id: 'clear2',
        label: 'Clear Point 2',
        partyStatus: PartyStatus.ClearParty,
        order: 5,
        active: true,
      },
    ];

    it('should return undefined for non-existent prog point', async () => {
      mockEncountersCollection.getEncounter.mockResolvedValue(undefined);
      mockEncountersCollection.getProgPoints.mockResolvedValue([]);

      const result = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'non-existent',
      );

      expect(result).toBeUndefined();
    });

    it('should fall back to prog point party status when no thresholds are configured', async () => {
      const mockEncounter: EncounterDocument = {
        name: 'Test Encounter',
        description: 'Test Description',
        active: true,
        // No thresholds configured
      };

      mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      const result = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog1',
      );

      expect(result).toBe(PartyStatus.ProgParty);
    });

    it('should fall back to prog point party status when encounter does not exist', async () => {
      mockEncountersCollection.getEncounter.mockResolvedValue(undefined);
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      const result = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear1',
      );

      expect(result).toBe(PartyStatus.ClearParty);
    });

    it('should use threshold-based determination when thresholds are configured', async () => {
      const mockEncounter: EncounterDocument = {
        name: 'Test Encounter',
        description: 'Test Description',
        active: true,
        progPartyThreshold: 'prog1', // order: 2
        clearPartyThreshold: 'clear1', // order: 4
      };

      mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      // Test early prog party (before prog threshold)
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'early1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      // Test prog party (at prog threshold)
      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog1',
      );
      expect(progResult).toBe(PartyStatus.ProgParty);

      // Test prog party (between prog and clear threshold)
      const progResult2 = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog2',
      );
      expect(progResult2).toBe(PartyStatus.ProgParty);

      // Test clear party (at clear threshold)
      const clearResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear1',
      );
      expect(clearResult).toBe(PartyStatus.ClearParty);

      // Test clear party (after clear threshold)
      const clearResult2 = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear2',
      );
      expect(clearResult2).toBe(PartyStatus.ClearParty);
    });

    it('should handle only prog threshold configured', async () => {
      const mockEncounter: EncounterDocument = {
        name: 'Test Encounter',
        description: 'Test Description',
        active: true,
        progPartyThreshold: 'prog1', // order: 2
        // No clear threshold
      };

      mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      // Before prog threshold should be early prog
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'early1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      // At and after prog threshold should be prog party
      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog1',
      );
      expect(progResult).toBe(PartyStatus.ProgParty);

      const laterProgResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear1',
      );
      expect(laterProgResult).toBe(PartyStatus.ProgParty);
    });

    it('should handle only clear threshold configured', async () => {
      const mockEncounter: EncounterDocument = {
        name: 'Test Encounter',
        description: 'Test Description',
        active: true,
        // No prog threshold
        clearPartyThreshold: 'clear1', // order: 4
      };

      mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      // Before clear threshold should be early prog
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'early1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog1',
      );
      expect(progResult).toBe(PartyStatus.EarlyProgParty);

      // At and after clear threshold should be clear party
      const clearResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear1',
      );
      expect(clearResult).toBe(PartyStatus.ClearParty);
    });

    it('should handle unsorted prog points correctly', async () => {
      const unsortedProgPoints: ProgPointDocument[] = [
        {
          id: 'point3',
          label: 'Point 3',
          partyStatus: PartyStatus.ProgParty,
          order: 2,
          active: true,
        },
        {
          id: 'point1',
          label: 'Point 1',
          partyStatus: PartyStatus.EarlyProgParty,
          order: 0,
          active: true,
        },
        {
          id: 'point2',
          label: 'Point 2',
          partyStatus: PartyStatus.EarlyProgParty,
          order: 1,
          active: true,
        },
      ];

      const mockEncounter: EncounterDocument = {
        name: 'Test Encounter',
        description: 'Test Description',
        active: true,
        progPartyThreshold: 'point2', // order: 1
        clearPartyThreshold: 'point3', // order: 2
      };

      mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);
      mockEncountersCollection.getProgPoints.mockResolvedValue(
        unsortedProgPoints,
      );

      // Test that ordering works correctly
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'point1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'point2',
      );
      expect(progResult).toBe(PartyStatus.ProgParty);

      const clearResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'point3',
      );
      expect(clearResult).toBe(PartyStatus.ClearParty);
    });
  });

  describe('basic CRUD operations', () => {
    it('should delegate getEncounter to collection', async () => {
      const mockEncounter: EncounterDocument = {
        name: 'Test Encounter',
        description: 'Test Description',
        active: true,
      };
      mockEncountersCollection.getEncounter.mockResolvedValue(mockEncounter);

      const result = await service.getEncounter('test-id');

      expect(mockEncountersCollection.getEncounter).toHaveBeenCalledWith(
        'test-id',
      );
      expect(result).toBe(mockEncounter);
    });

    it('should delegate getProgPoints to collection', async () => {
      const mockProgPoints: ProgPointDocument[] = [
        {
          id: 'test1',
          label: 'Test 1',
          partyStatus: PartyStatus.ProgParty,
          order: 0,
          active: true,
        },
      ];
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      const result = await service.getProgPoints('test-id');

      expect(mockEncountersCollection.getProgPoints).toHaveBeenCalledWith(
        'test-id',
      );
      expect(result).toBe(mockProgPoints);
    });

    it('should add prog point with auto-generated order', async () => {
      const progPointData = {
        id: 'test1',
        label: 'Test 1',
        partyStatus: PartyStatus.ProgParty,
      };

      // Mock the getNextProgPointOrder method
      mockEncountersCollection.getNextProgPointOrder.mockResolvedValue(5);

      await service.addProgPoint('test-encounter', progPointData);

      expect(
        mockEncountersCollection.getNextProgPointOrder,
      ).toHaveBeenCalledWith('test-encounter');
      expect(mockEncountersCollection.addProgPoint).toHaveBeenCalledWith(
        'test-encounter',
        {
          id: 'test1',
          label: 'Test 1',
          partyStatus: PartyStatus.ProgParty,
          order: 5,
          active: true,
        },
      );
    });

    it('should delegate updateProgPoint to collection', async () => {
      const updates = { label: 'Updated Label' };

      await service.updateProgPoint(
        'test-encounter',
        'test-prog-point',
        updates,
      );

      expect(mockEncountersCollection.updateProgPoint).toHaveBeenCalledWith(
        'test-encounter',
        'test-prog-point',
        updates,
      );
    });

    it('should delegate removeProgPoint to collection', async () => {
      await service.removeProgPoint('test-encounter', 'test-prog-point');

      expect(mockEncountersCollection.removeProgPoint).toHaveBeenCalledWith(
        'test-encounter',
        'test-prog-point',
      );
    });

    it('should delegate setProgPartyThreshold to collection', async () => {
      await service.setProgPartyThreshold('test-encounter', 'test-prog-point');

      expect(mockEncountersCollection.upsertEncounter).toHaveBeenCalledWith(
        'test-encounter',
        {
          progPartyThreshold: 'test-prog-point',
        },
      );
    });

    it('should delegate setClearPartyThreshold to collection', async () => {
      await service.setClearPartyThreshold('test-encounter', 'test-prog-point');

      expect(mockEncountersCollection.upsertEncounter).toHaveBeenCalledWith(
        'test-encounter',
        {
          clearPartyThreshold: 'test-prog-point',
        },
      );
    });
  });
});
