import { Test } from '@nestjs/testing';
import type {
  CreateEventRequest,
  GetEventsQuery,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';
import { Encounter, EventStatus } from '@ulti-project/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { EventsService } from './events.service.js';

describe('EventsService', () => {
  let service: EventsService;
  let eventsCollection: EventsCollection;

  const mockGuildId = 'test-guild-123';
  const mockEventId = 'test-event-456';

  const mockEvent: ScheduledEvent = {
    id: mockEventId,
    name: 'Test Event',
    encounter: Encounter.FRU,
    scheduledTime: new Date('2023-12-01T14:00:00Z'),
    duration: 180,
    teamLeaderId: 'team-leader-123',
    teamLeaderName: 'Team Leader',
    status: EventStatus.Published,
    roster: {
      party: [],
      totalSlots: 8,
      filledSlots: 0,
    },
    createdAt: new Date('2023-12-01T10:00:00Z'),
    lastModified: new Date('2023-12-01T10:00:00Z'),
    version: 1,
  };

  const mockCreateRequest: CreateEventRequest = {
    guildId: mockGuildId,
    name: 'Test Event',
    encounter: Encounter.FRU,
    scheduledTime: new Date('2023-12-01T14:00:00Z'),
    duration: 180,
    teamLeaderId: 'team-leader-123',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: EventsCollection,
          useValue: {
            getEventsFiltered: vi.fn(),
            getEvent: vi.fn(),
            createEvent: vi.fn(),
            updateEvent: vi.fn(),
            deleteEvent: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EventsService);
    eventsCollection = module.get(EventsCollection);
  });

  describe('getEvents', () => {
    const mockQuery: GetEventsQuery = {
      guildId: mockGuildId,
      limit: 10,
      cursor: 'test-cursor',
    };

    it('should return events with guildId added and pagination info', async () => {
      const mockResult = {
        events: [mockEvent, { ...mockEvent, id: 'event-2' }],
        nextCursor: 'next-cursor',
        hasMore: true,
      };

      vi.spyOn(eventsCollection, 'getEventsFiltered').mockResolvedValue(
        mockResult,
      );

      const result = await service.getEvents(mockQuery);

      expect(eventsCollection.getEventsFiltered).toHaveBeenCalledWith(
        mockQuery,
      );
      expect(result).toEqual({
        events: [
          { ...mockEvent, guildId: mockGuildId },
          { ...mockEvent, id: 'event-2', guildId: mockGuildId },
        ],
        nextCursor: 'next-cursor',
        hasMore: true,
      });
    });

    it('should handle empty events list', async () => {
      const mockResult = {
        events: [],
        nextCursor: undefined,
        hasMore: false,
      };

      vi.spyOn(eventsCollection, 'getEventsFiltered').mockResolvedValue(
        mockResult,
      );

      const result = await service.getEvents(mockQuery);

      expect(result).toEqual({
        events: [],
        nextCursor: undefined,
        hasMore: false,
      });
    });

    it('should propagate errors from events collection', async () => {
      const error = new Error('Firestore error');
      vi.spyOn(eventsCollection, 'getEventsFiltered').mockRejectedValue(error);

      await expect(service.getEvents(mockQuery)).rejects.toThrow(
        'Firestore error',
      );
    });
  });

  describe('getEvent', () => {
    it('should return event when found', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);

      const result = await service.getEvent(mockGuildId, mockEventId);

      expect(eventsCollection.getEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
      expect(result).toEqual(mockEvent);
    });

    it('should return null when event not found', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(null);

      const result = await service.getEvent(mockGuildId, mockEventId);

      expect(result).toBeNull();
    });

    it('should propagate errors from events collection', async () => {
      const error = new Error('Firestore error');
      vi.spyOn(eventsCollection, 'getEvent').mockRejectedValue(error);

      await expect(service.getEvent(mockGuildId, mockEventId)).rejects.toThrow(
        'Firestore error',
      );
    });
  });

  describe('createEvent', () => {
    it('should create and return event', async () => {
      const mockCreatedEvent = {
        id: 'generated-event-id',
        name: mockCreateRequest.name,
        encounter: mockCreateRequest.encounter,
        scheduledTime: mockCreateRequest.scheduledTime,
        duration: mockCreateRequest.duration,
        teamLeaderId: mockCreateRequest.teamLeaderId,
        teamLeaderName: '',
        status: EventStatus.Draft,
        roster: {
          party: [],
          totalSlots: 8,
          filledSlots: 0,
        },
        createdAt: new Date('2023-12-01T10:00:00Z'),
        lastModified: new Date('2023-12-01T10:00:00Z'),
        version: 1,
      };

      vi.spyOn(eventsCollection, 'createEvent').mockResolvedValue(
        mockCreatedEvent,
      );

      const result = await service.createEvent(mockGuildId, mockCreateRequest);

      expect(eventsCollection.createEvent).toHaveBeenCalledWith(
        mockGuildId,
        expect.objectContaining({
          name: mockCreateRequest.name,
          encounter: mockCreateRequest.encounter,
          scheduledTime: mockCreateRequest.scheduledTime,
          duration: mockCreateRequest.duration,
          teamLeaderId: mockCreateRequest.teamLeaderId,
          teamLeaderName: '',
          status: EventStatus.Draft,
        }),
      );
      expect(result).toEqual(mockCreatedEvent);
    });

    it('should propagate errors from events collection', async () => {
      const error = new Error('Creation failed');
      vi.spyOn(eventsCollection, 'createEvent').mockRejectedValue(error);

      await expect(
        service.createEvent(mockGuildId, mockCreateRequest),
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('updateEvent', () => {
    it('should update and return event', async () => {
      const updateRequest: UpdateEventRequest = {
        name: 'Updated Event',
        duration: 240,
      };

      const updatedEvent = {
        ...mockEvent,
        name: 'Updated Event',
        duration: 240,
        lastModified: new Date(),
        version: mockEvent.version + 1,
      };

      // Mock getEvent to return the existing event
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      // Mock updateEvent to return the updated event
      vi.spyOn(eventsCollection, 'updateEvent').mockResolvedValue(updatedEvent);

      const result = await service.updateEvent(
        mockGuildId,
        mockEventId,
        updateRequest,
      );

      expect(eventsCollection.getEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
      expect(eventsCollection.updateEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
        expect.objectContaining({
          ...mockEvent,
          name: 'Updated Event',
          duration: 240,
          version: mockEvent.version + 1,
          lastModified: expect.any(Date),
        }),
      );
      expect(result).toEqual(updatedEvent);
    });

    it('should throw NotFoundException when event not found', async () => {
      const updateRequest: UpdateEventRequest = {
        name: 'Updated Event',
      };

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(null);

      await expect(
        service.updateEvent(mockGuildId, mockEventId, updateRequest),
      ).rejects.toThrow('Event with id test-event-456 not found');
    });

    it('should propagate errors from events collection', async () => {
      const updateRequest: UpdateEventRequest = {
        name: 'Updated Event',
      };

      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      const error = new Error('Update failed');
      vi.spyOn(eventsCollection, 'updateEvent').mockRejectedValue(error);

      await expect(
        service.updateEvent(mockGuildId, mockEventId, updateRequest),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteEvent', () => {
    it('should delete an existing event', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      vi.spyOn(eventsCollection, 'deleteEvent').mockResolvedValue(undefined);

      await expect(
        service.deleteEvent(mockGuildId, mockEventId),
      ).resolves.toBeUndefined();

      expect(eventsCollection.getEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
      expect(eventsCollection.deleteEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
    });

    it('should throw NotFoundException when event does not exist', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(null);

      await expect(
        service.deleteEvent(mockGuildId, mockEventId),
      ).rejects.toThrow('Event with id test-event-456 not found');

      expect(eventsCollection.getEvent).toHaveBeenCalledWith(
        mockGuildId,
        mockEventId,
      );
      expect(eventsCollection.deleteEvent).not.toHaveBeenCalled();
    });

    it('should propagate errors from events collection', async () => {
      vi.spyOn(eventsCollection, 'getEvent').mockResolvedValue(mockEvent);
      const error = new Error('Delete failed');
      vi.spyOn(eventsCollection, 'deleteEvent').mockRejectedValue(error);

      await expect(
        service.deleteEvent(mockGuildId, mockEventId),
      ).rejects.toThrow('Delete failed');
    });
  });
});
