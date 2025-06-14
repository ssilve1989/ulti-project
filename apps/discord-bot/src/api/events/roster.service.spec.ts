import { Test } from '@nestjs/testing';
import { Role } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { DraftLocksService } from './draft-locks.service.js';
import { RosterService } from './roster.service.js';

describe('RosterService', () => {
  let service: RosterService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RosterService,
        {
          provide: EventsCollection,
          useValue: {
            getEvent: vi.fn(),
            updateEvent: vi.fn(),
          },
        },
        {
          provide: DraftLocksService,
          useValue: {
            getEventLocks: vi.fn(),
            releaseLock: vi.fn(),
          },
        },
        {
          provide: ParticipantsService,
          useValue: {
            getParticipants: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RosterService);
  });

  describe('createEmptyRoster', () => {
    it('should create empty roster with correct FFXIV party composition', () => {
      const roster = service.createEmptyRoster();

      expect(roster).toHaveLength(8);

      // Count slots by role
      const tankSlots = roster.filter((slot) => slot.role === Role.Tank);
      const healerSlots = roster.filter((slot) => slot.role === Role.Healer);
      const dpsSlots = roster.filter((slot) => slot.role === Role.DPS);

      expect(tankSlots).toHaveLength(2);
      expect(healerSlots).toHaveLength(2);
      expect(dpsSlots).toHaveLength(4);

      // Verify all slots are empty and properly initialized
      for (const slot of roster) {
        expect(slot.id).toBeDefined();
        expect(slot.assignedParticipant).toBeUndefined();
        expect(slot.isHelperSlot).toBe(false);
        expect(slot.role).toBeOneOf([Role.Tank, Role.Healer, Role.DPS]);
      }

      // Verify all slot IDs are unique
      const slotIds = roster.map((slot) => slot.id);
      const uniqueSlotIds = new Set(slotIds);
      expect(uniqueSlotIds.size).toBe(8);
    });
  });
});
