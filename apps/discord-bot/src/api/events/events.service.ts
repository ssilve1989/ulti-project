import { Injectable } from '@nestjs/common';
import type {
  GetEventsQuery,
  GetEventsResponse,
  ScheduledEvent,
} from '@ulti-project/shared';
import { EventsCollection } from '../../firebase/collections/events.collection.js';

@Injectable()
class EventsService {
  constructor(private readonly eventsCollection: EventsCollection) {}

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
    event: ScheduledEvent,
  ): Promise<ScheduledEvent> {
    return this.eventsCollection.createEvent(guildId, event);
  }

  async updateEvent(
    guildId: string,
    eventId: string,
    event: ScheduledEvent,
  ): Promise<ScheduledEvent> {
    return this.eventsCollection.updateEvent(guildId, eventId, event);
  }

  async deleteEvent(guildId: string, eventId: string): Promise<void> {
    // Implementation will depend on your delete requirements
    // For now, just a placeholder
    throw new Error('Delete event not implemented');
  }
}

export { EventsService };
