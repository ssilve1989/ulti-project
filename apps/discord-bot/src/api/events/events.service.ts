import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateEventRequest,
  GetEventsQuery,
  GetEventsResponse,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';
import { EventStatus } from '@ulti-project/shared';
import { EventsCollection } from '../../firebase/collections/events.collection.js';
import { RosterService } from './roster.service.js';

@Injectable()
class EventsService {
  constructor(
    private readonly eventsCollection: EventsCollection,
    private readonly rosterService: RosterService,
  ) {}

  async getEvents(query: GetEventsQuery): Promise<GetEventsResponse> {
    // Use Firestore filtering instead of in-memory filtering
    const result = await this.eventsCollection.getEventsFiltered(query);

    // Add guildId to each event for response format
    const eventsWithGuildId = result.events.map((event) => ({
      ...event,
      guildId: query.guildId,
    }));

    return {
      events: eventsWithGuildId,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getEvent(
    guildId: string,
    eventId: string,
  ): Promise<ScheduledEvent | null> {
    return this.eventsCollection.getEvent(guildId, eventId);
  }

  async createEvent(
    guildId: string,
    createRequest: CreateEventRequest,
  ): Promise<ScheduledEvent> {
    // Generate unique ID for the event
    const eventId = randomUUID();

    // Create empty roster with proper party slots
    const partySlots = this.rosterService.createEmptyRoster();

    // Transform CreateEventRequest into ScheduledEvent
    const scheduledEvent: ScheduledEvent = {
      id: eventId,
      name: createRequest.name,
      encounter: createRequest.encounter,
      scheduledTime: createRequest.scheduledTime,
      duration: createRequest.duration,
      teamLeaderId: createRequest.teamLeaderId,
      teamLeaderName: '', // Will be populated from Discord user data
      status: EventStatus.Draft,
      roster: {
        party: partySlots,
        totalSlots: 8, // FFXIV party always has 8 slots
        filledSlots: 0,
      },
      createdAt: new Date(),
      lastModified: new Date(),
      version: 1,
    };

    return this.eventsCollection.createEvent(guildId, scheduledEvent);
  }

  async updateEvent(
    guildId: string,
    eventId: string,
    updateRequest: UpdateEventRequest,
  ): Promise<ScheduledEvent> {
    // Get the existing event
    const existingEvent = await this.eventsCollection.getEvent(
      guildId,
      eventId,
    );
    if (!existingEvent) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Merge the update request with the existing event
    const updatedEvent: ScheduledEvent = {
      ...existingEvent,
      ...updateRequest,
      lastModified: new Date(),
      version: existingEvent.version + 1, // Increment version for optimistic locking
    };

    return this.eventsCollection.updateEvent(guildId, eventId, updatedEvent);
  }

  async deleteEvent(guildId: string, eventId: string): Promise<void> {
    // Check if the event exists before attempting to delete
    const existingEvent = await this.eventsCollection.getEvent(
      guildId,
      eventId,
    );
    if (!existingEvent) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    await this.eventsCollection.deleteEvent(guildId, eventId);
  }
}

export { EventsService };
