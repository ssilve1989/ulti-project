import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DraftLock } from '@ulti-project/shared';
import { ParticipantType } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLocksController } from './draft-locks.controller.js';
import { DraftLocksService } from './draft-locks.service.js';

describe('DraftLocksController', () => {
  let controller: DraftLocksController;
  let service: DraftLocksService;

  const mockGuildId = 'test-guild-123';
  const mockEventId = 'test-event-456';
  const mockTeamLeaderId = 'team-leader-123';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DraftLocksController],
      providers: [
        {
          provide: DraftLocksService,
          useValue: {
            getEventLocks: vi.fn(),
            createLock: vi.fn(),
            releaseLock: vi.fn(),
            releaseTeamLeaderLocks: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<DraftLocksController>(DraftLocksController);
    service = module.get<DraftLocksService>(DraftLocksService);
  });

  describe('GET /:eventId/locks', () => {
    it('should return event locks', async () => {
      const mockLocks: DraftLock[] = [
        {
          id: 'lock-1',
          eventId: mockEventId,
          participantId: 'participant-1',
          participantType: ParticipantType.Progger,
          lockedBy: mockTeamLeaderId,
          lockedByName: 'Team Leader',
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      ];

      vi.spyOn(service, 'getEventLocks').mockResolvedValue(mockLocks);

      const result = await controller.getEventLocks(
        { eventId: mockEventId },
        { guildId: mockGuildId },
      );

      expect(result).toEqual(mockLocks);
      expect(service.getEventLocks).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
    });
  });

  describe('POST /:eventId/locks', () => {
    it('should create a new lock', async () => {
      const mockLock: DraftLock = {
        id: 'new-lock',
        eventId: mockEventId,
        participantId: 'participant-1',
        participantType: ParticipantType.Progger,
        lockedBy: mockTeamLeaderId,
        lockedByName: 'Team Leader',
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      const createRequest = {
        participantId: 'participant-1',
        participantType: ParticipantType.Progger,
        slotId: 'slot-1',
      };

      vi.spyOn(service, 'createLock').mockResolvedValue(mockLock);

      const result = await controller.createLock(
        { eventId: mockEventId },
        { guildId: mockGuildId, teamLeaderId: mockTeamLeaderId },
        createRequest,
      );

      expect(result).toEqual(mockLock);
      expect(service.createLock).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
        mockTeamLeaderId,
        `Team Leader ${mockTeamLeaderId}`,
        createRequest,
      );
    });
  });

  describe('DELETE /:eventId/locks/:participantType/:participantId', () => {
    it('should release a lock', async () => {
      vi.spyOn(service, 'releaseLock').mockResolvedValue(undefined);

      const result = await controller.releaseLock(
        {
          eventId: mockEventId,
          participantType: ParticipantType.Progger,
          participantId: 'participant-1',
        },
        { guildId: mockGuildId, teamLeaderId: mockTeamLeaderId },
      );

      expect(result).toEqual({ success: true });
      expect(service.releaseLock).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
        ParticipantType.Progger,
        'participant-1',
        mockTeamLeaderId,
      );
    });

    it('should handle NotFoundException', async () => {
      vi.spyOn(service, 'releaseLock').mockRejectedValue(
        new NotFoundException('Draft lock not found'),
      );

      await expect(
        controller.releaseLock(
          {
            eventId: mockEventId,
            participantType: ParticipantType.Progger,
            participantId: 'participant-1',
          },
          { guildId: mockGuildId, teamLeaderId: mockTeamLeaderId },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle ConflictException', async () => {
      vi.spyOn(service, 'releaseLock').mockRejectedValue(
        new ConflictException('Lock is held by another team leader'),
      );

      await expect(
        controller.releaseLock(
          {
            eventId: mockEventId,
            participantType: ParticipantType.Progger,
            participantId: 'participant-1',
          },
          { guildId: mockGuildId, teamLeaderId: mockTeamLeaderId },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /:eventId/locks/team-leader/:teamLeaderId', () => {
    it('should release all team leader locks', async () => {
      const mockLocks: DraftLock[] = [
        {
          id: 'lock-1',
          eventId: mockEventId,
          participantId: 'participant-1',
          participantType: ParticipantType.Progger,
          lockedBy: mockTeamLeaderId,
          lockedByName: 'Team Leader',
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      ];

      vi.spyOn(service, 'releaseTeamLeaderLocks').mockResolvedValue(mockLocks);

      const result = await controller.releaseTeamLeaderLocks(
        { eventId: mockEventId, teamLeaderId: mockTeamLeaderId },
        { guildId: mockGuildId },
      );

      expect(result).toEqual({ success: true });
      expect(service.releaseTeamLeaderLocks).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
        mockTeamLeaderId,
      );
    });
  });
});
