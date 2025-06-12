import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateDraftLockRequest, DraftLock } from '@ulti-project/shared';
import { Encounter, EventStatus, ParticipantType } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLocksCollection } from '../../firebase/collections/draft-locks.collection.js';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { DraftLocksService } from './draft-locks.service.js';

describe('DraftLocksService', () => {
  let service: DraftLocksService;
  let draftLocksCollection: DraftLocksCollection;
  let eventsCollection: EventsCollection;

  const mockGuildId = 'test-guild-123';
  const mockEventId = 'test-event-456';
  const mockTeamLeaderId = 'team-leader-123';
  const mockTeamLeaderName = 'Team Leader';

  const mockEvent = {
    id: mockEventId,
    name: 'Test Event',
    encounter: Encounter.FRU,
    scheduledTime: new Date(),
    duration: 180,
    teamLeaderId: mockTeamLeaderId,
    teamLeaderName: mockTeamLeaderName,
    status: EventStatus.Published,
    roster: { party: [], totalSlots: 8, filledSlots: 0 },
    createdAt: new Date(),
    lastModified: new Date(),
    version: 1,
  };

  const mockLockRequest: CreateDraftLockRequest = {
    participantId: 'participant-123',
    participantType: ParticipantType.Progger,
    slotId: 'slot-1',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DraftLocksService,
        {
          provide: DraftLocksCollection,
          useValue: {
            getEventLocks: vi.fn(),
            createLock: vi.fn(),
            findLockByParticipant: vi.fn(),
            releaseLock: vi.fn(),
            releaseTeamLeaderLocks: vi.fn(),
          },
        },
        {
          provide: EventsCollection,
          useValue: {
            getEvent: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DraftLocksService>(DraftLocksService);
    draftLocksCollection =
      module.get<DraftLocksCollection>(DraftLocksCollection);
    eventsCollection = module.get<EventsCollection>(EventsCollection);
  });

  describe('getEventLocks', () => {
    it('should return locks for an existing event', async () => {
      const mockLocks: DraftLock[] = [
        {
          id: 'lock-1',
          eventId: mockEventId,
          participantId: 'participant-1',
          participantType: ParticipantType.Progger,
          lockedBy: mockTeamLeaderId,
          lockedByName: mockTeamLeaderName,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      ];

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      vi.spyOn(draftLocksCollection, 'getEventLocks').mockResolvedValue(
        mockLocks,
      );

      const result = await service.getEventLocks(mockGuildId, mockEventId);

      expect(result).toEqual(mockLocks);
      expect(eventsCollection.getEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
      expect(draftLocksCollection.getEventLocks).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
    });

    it('should throw NotFoundException when event does not exist', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(null);

      await expect(
        service.getEventLocks(mockGuildId, mockEventId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createLock', () => {
    it('should create a new lock when participant is not locked', async () => {
      const mockLock: DraftLock = {
        id: expect.any(String),
        eventId: mockEventId,
        participantId: mockLockRequest.participantId,
        participantType: mockLockRequest.participantType,
        lockedBy: mockTeamLeaderId,
        lockedByName: mockTeamLeaderName,
        lockedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      };

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      vi.spyOn(draftLocksCollection, 'findLockByParticipant').mockResolvedValue(
        null,
      );
      vi.spyOn(draftLocksCollection, 'createLock').mockResolvedValue(mockLock);

      const result = await service.createLock(
        mockGuildId,
        mockEventId,
        mockTeamLeaderId,
        mockTeamLeaderName,
        mockLockRequest,
      );

      expect(result).toEqual(mockLock);
      expect(draftLocksCollection.createLock).toHaveBeenCalledWith(
        mockGuildId,
        expect.objectContaining({
          eventId: mockEventId,
          participantId: mockLockRequest.participantId,
          participantType: mockLockRequest.participantType,
          lockedBy: mockTeamLeaderId,
          lockedByName: mockTeamLeaderName,
        }),
      );
    });

    it('should return existing lock when same team leader locks participant again', async () => {
      const existingLock: DraftLock = {
        id: 'existing-lock',
        eventId: mockEventId,
        participantId: mockLockRequest.participantId,
        participantType: mockLockRequest.participantType,
        lockedBy: mockTeamLeaderId,
        lockedByName: mockTeamLeaderName,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      vi.spyOn(draftLocksCollection, 'findLockByParticipant').mockResolvedValue(
        existingLock,
      );

      const result = await service.createLock(
        mockGuildId,
        mockEventId,
        mockTeamLeaderId,
        mockTeamLeaderName,
        mockLockRequest,
      );

      expect(result).toEqual(existingLock);
      expect(draftLocksCollection.createLock).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when participant is locked by another team leader', async () => {
      const existingLock: DraftLock = {
        id: 'existing-lock',
        eventId: mockEventId,
        participantId: mockLockRequest.participantId,
        participantType: mockLockRequest.participantType,
        lockedBy: 'other-team-leader',
        lockedByName: 'Other Team Leader',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      vi.spyOn(draftLocksCollection, 'findLockByParticipant').mockResolvedValue(
        existingLock,
      );

      await expect(
        service.createLock(
          mockGuildId,
          mockEventId,
          mockTeamLeaderId,
          mockTeamLeaderName,
          mockLockRequest,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when event does not exist', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(null);

      await expect(
        service.createLock(
          mockGuildId,
          mockEventId,
          mockTeamLeaderId,
          mockTeamLeaderName,
          mockLockRequest,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('releaseLock', () => {
    it('should release lock when team leader owns it', async () => {
      const existingLock: DraftLock = {
        id: 'lock-1',
        eventId: mockEventId,
        participantId: mockLockRequest.participantId,
        participantType: mockLockRequest.participantType,
        lockedBy: mockTeamLeaderId,
        lockedByName: mockTeamLeaderName,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      vi.spyOn(draftLocksCollection, 'findLockByParticipant').mockResolvedValue(
        existingLock,
      );
      vi.spyOn(draftLocksCollection, 'releaseLock').mockResolvedValue(
        undefined,
      );

      await service.releaseLock(
        mockGuildId,
        mockEventId,
        mockLockRequest.participantType,
        mockLockRequest.participantId,
        mockTeamLeaderId,
      );

      expect(draftLocksCollection.releaseLock).toHaveBeenCalledWith(
        mockGuildId,
        existingLock.id,
      );
    });

    it('should throw NotFoundException when lock does not exist', async () => {
      vi.spyOn(draftLocksCollection, 'findLockByParticipant').mockResolvedValue(
        null,
      );

      await expect(
        service.releaseLock(
          mockGuildId,
          mockEventId,
          mockLockRequest.participantType,
          mockLockRequest.participantId,
          mockTeamLeaderId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when team leader does not own the lock', async () => {
      const existingLock: DraftLock = {
        id: 'lock-1',
        eventId: mockEventId,
        participantId: mockLockRequest.participantId,
        participantType: mockLockRequest.participantType,
        lockedBy: 'other-team-leader',
        lockedByName: 'Other Team Leader',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      vi.spyOn(draftLocksCollection, 'findLockByParticipant').mockResolvedValue(
        existingLock,
      );

      await expect(
        service.releaseLock(
          mockGuildId,
          mockEventId,
          mockLockRequest.participantType,
          mockLockRequest.participantId,
          mockTeamLeaderId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('releaseTeamLeaderLocks', () => {
    it('should release all locks held by a team leader for an event', async () => {
      const mockLocks: DraftLock[] = [
        {
          id: 'lock-1',
          eventId: mockEventId,
          participantId: 'participant-1',
          participantType: ParticipantType.Progger,
          lockedBy: mockTeamLeaderId,
          lockedByName: mockTeamLeaderName,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
        {
          id: 'lock-2',
          eventId: mockEventId,
          participantId: 'participant-2',
          participantType: ParticipantType.Helper,
          lockedBy: mockTeamLeaderId,
          lockedByName: mockTeamLeaderName,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      ];

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      vi.spyOn(
        draftLocksCollection,
        'releaseTeamLeaderLocks',
      ).mockResolvedValue(mockLocks);

      const result = await service.releaseTeamLeaderLocks(
        mockGuildId,
        mockEventId,
        mockTeamLeaderId,
      );

      expect(result).toEqual(mockLocks);
      expect(draftLocksCollection.releaseTeamLeaderLocks).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
        mockTeamLeaderId,
      );
    });

    it('should throw NotFoundException when event does not exist', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(null);

      await expect(
        service.releaseTeamLeaderLocks(
          mockGuildId,
          mockEventId,
          mockTeamLeaderId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEventLocksStream', () => {
    it('should return stream from collection', () => {
      const mockStream = { subscribe: vi.fn() };
      draftLocksCollection.getEventLocksStream = vi
        .fn()
        .mockReturnValue(mockStream);

      const result = service.getEventLocksStream(mockGuildId, mockEventId);

      expect(result).toBe(mockStream);
      expect(draftLocksCollection.getEventLocksStream).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
    });
  });
});
