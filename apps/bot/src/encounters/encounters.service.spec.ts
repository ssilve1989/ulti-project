import { Test } from '@nestjs/testing';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '@ulti-project/shared';
import { PartyStatus } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { EncountersCollection } from '#src/firebase/collections/encounters-collection.js';
import { createAutoMock } from '#src/test-utils/mock-factory.js';
import { EncountersService } from './encounters.service.js';

describe('EncountersService', () => {
  let service: EncountersService;
  let mockEncountersCollection: Mocked<EncountersCollection>;

  beforeEach(async () => {
    mockEncountersCollection = createAutoMock<EncountersCollection>();

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

    it('should throw error for non-existent prog point', async () => {
      mockEncountersCollection.getProgPoints.mockResolvedValue([]);

      await expect(
        service.getPartyStatusForProgPoint('test-encounter', 'non-existent'),
      ).rejects.toThrow(
        'Prog point not found: non-existent for encounter: test-encounter',
      );
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

    it('should return prog point direct party status', async () => {
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      // Should return the direct party status from each prog point
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'early1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog1',
      );
      expect(progResult).toBe(PartyStatus.ProgParty);

      const clearResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear1',
      );
      expect(clearResult).toBe(PartyStatus.ClearParty);
    });

    it('should return prog point direct party status regardless of thresholds', async () => {
      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      // Should return the direct party status from each prog point
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'early1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'prog1',
      );
      expect(progResult).toBe(PartyStatus.ProgParty);

      const clearResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'clear1',
      );
      expect(clearResult).toBe(PartyStatus.ClearParty);
    });

    it('should return direct party status from unsorted prog points', async () => {
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

      mockEncountersCollection.getProgPoints.mockResolvedValue(
        unsortedProgPoints,
      );

      // Should return the direct party status from each prog point
      const earlyResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'point1',
      );
      expect(earlyResult).toBe(PartyStatus.EarlyProgParty);

      const progResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'point2',
      );
      expect(progResult).toBe(PartyStatus.EarlyProgParty);

      const clearResult = await service.getPartyStatusForProgPoint(
        'test-encounter',
        'point3',
      );
      expect(clearResult).toBe(PartyStatus.ProgParty);
    });
  });

  describe('getProgPointsAsOptions', () => {
    it('should transform prog points to options format', async () => {
      const mockProgPoints: ProgPointDocument[] = [
        {
          id: 'test1',
          label: 'Test Point 1',
          partyStatus: PartyStatus.EarlyProgParty,
          order: 0,
          active: true,
        },
        {
          id: 'test2',
          label: 'Test Point 2',
          partyStatus: PartyStatus.ProgParty,
          order: 1,
          active: true,
        },
        {
          id: 'test3',
          label: 'Test Point 3',
          partyStatus: PartyStatus.ClearParty,
          order: 2,
          active: true,
        },
      ];

      mockEncountersCollection.getProgPoints.mockResolvedValue(mockProgPoints);

      const result = await service.getProgPointsAsOptions('test-encounter');

      expect(mockEncountersCollection.getProgPoints).toHaveBeenCalledWith(
        'test-encounter',
      );
      expect(result).toEqual({
        test1: {
          label: 'Test Point 1',
          partyStatus: PartyStatus.EarlyProgParty,
        },
        test2: {
          label: 'Test Point 2',
          partyStatus: PartyStatus.ProgParty,
        },
        test3: {
          label: 'Test Point 3',
          partyStatus: PartyStatus.ClearParty,
        },
      });
    });

    it('should return empty object when no prog points exist', async () => {
      mockEncountersCollection.getProgPoints.mockResolvedValue([]);

      const result = await service.getProgPointsAsOptions('test-encounter');

      expect(result).toEqual({});
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
  });
});
