// Integration test for helpers API
import { Test } from '@nestjs/testing';
import { Job, Role } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelperAbsenceCollection } from '../../firebase/collections/helper-absence.collection.js';
import { HelperCollection } from '../../firebase/collections/helper.collection.js';
import { HelpersService } from './helpers.service.js';

describe('HelpersService', () => {
  let service: HelpersService;
  let helperCollection: HelperCollection;
  let helperAbsenceCollection: HelperAbsenceCollection;

  const mockHelper = {
    id: 'helper-1',
    discordId: '123456789',
    name: 'Test Helper',
    availableJobs: [
      { job: Job.WhiteMage, role: Role.Healer, isPreferred: true },
      { job: Job.Scholar, role: Role.Healer, isPreferred: false },
    ],
    weeklyAvailability: [
      {
        dayOfWeek: 1, // Monday
        timeRanges: [
          { start: '18:00', end: '22:00', timezone: 'America/New_York' },
        ],
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HelpersService,
        {
          provide: HelperCollection,
          useValue: {
            getHelpers: vi.fn().mockResolvedValue([mockHelper]),
            getHelper: vi.fn().mockResolvedValue(mockHelper),
            upsertHelper: vi.fn().mockResolvedValue(mockHelper),
          },
        },
        {
          provide: HelperAbsenceCollection,
          useValue: {
            getAbsences: vi.fn().mockResolvedValue([]),
            createAbsence: vi.fn().mockResolvedValue({
              id: 'absence-1',
              helperId: 'helper-1',
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-01-07'),
              reason: 'Vacation',
              createdAt: new Date(),
            }),
            getActiveAbsences: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<HelpersService>(HelpersService);
    helperCollection = moduleRef.get<HelperCollection>(HelperCollection);
    helperAbsenceCollection = moduleRef.get<HelperAbsenceCollection>(
      HelperAbsenceCollection,
    );
  });

  describe('getHelpers', () => {
    it('should return list of helpers', async () => {
      const result = await service.getHelpers('test-guild');

      expect(result).toEqual([
        {
          id: mockHelper.id,
          discordId: mockHelper.discordId,
          name: mockHelper.name,
          availableJobs: mockHelper.availableJobs,
          weeklyAvailability: mockHelper.weeklyAvailability,
        },
      ]);

      expect(helperCollection.getHelpers).toHaveBeenCalledWith('test-guild');
    });
  });

  describe('getHelper', () => {
    it('should return specific helper', async () => {
      const result = await service.getHelper('test-guild', 'helper-1');

      expect(result).toEqual({
        id: mockHelper.id,
        discordId: mockHelper.discordId,
        name: mockHelper.name,
        availableJobs: mockHelper.availableJobs,
        weeklyAvailability: mockHelper.weeklyAvailability,
      });

      expect(helperCollection.getHelper).toHaveBeenCalledWith(
        'test-guild',
        'helper-1',
      );
    });
  });

  describe('checkAvailability', () => {
    it('should check helper availability and return available when no conflicts', async () => {
      const startTime = new Date('2024-01-08T19:00:00.000Z'); // Monday 7PM UTC
      const endTime = new Date('2024-01-08T21:00:00.000Z'); // Monday 9PM UTC

      const result = await service.checkAvailability(
        'test-guild',
        'helper-1',
        startTime,
        endTime,
      );

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('reason');
      expect(helperCollection.getHelper).toHaveBeenCalledWith(
        'test-guild',
        'helper-1',
      );
      expect(helperAbsenceCollection.getActiveAbsences).toHaveBeenCalledWith(
        'test-guild',
        'helper-1',
        startTime,
      );
    });
  });

  describe('createAbsence', () => {
    it('should create helper absence', async () => {
      const absenceData = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
        reason: 'Vacation',
      };

      const result = await service.createAbsence(
        'test-guild',
        'helper-1',
        absenceData,
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('helperId', 'helper-1');
      expect(result).toHaveProperty('reason', 'Vacation');

      expect(helperAbsenceCollection.createAbsence).toHaveBeenCalledWith(
        'test-guild',
        'helper-1',
        absenceData,
      );
    });
  });
});
