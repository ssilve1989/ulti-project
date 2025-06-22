import type {
  CreateEventRequest,
  EventFilters,
  EventStatus,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';
import {
  createEventWithGuild,
  deleteEventWithGuild,
  getEventWithGuild,
  getEventsWithGuild,
  updateEventWithGuild,
} from '../../../mock/events.js';
import type {
  IApiContext,
  IEventsApi,
  IPaginatedResponse,
} from '../../interfaces/index.js';

export class MockEventsApi implements IEventsApi {
  constructor(public readonly context: IApiContext) {}

  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    return createEventWithGuild(this.context.guildId, request);
  }

  async getEvent(eventId: string): Promise<ScheduledEvent | null> {
    return getEventWithGuild(this.context.guildId, eventId);
  }

  async getEvents(
    filters?: EventFilters,
  ): Promise<IPaginatedResponse<ScheduledEvent>> {
    const response = await getEventsWithGuild(this.context.guildId, filters);
    return {
      data: response.events,
      total: response.total,
      hasMore: response.hasMore,
    };
  }

  async updateEvent(
    eventId: string,
    updates: UpdateEventRequest,
  ): Promise<ScheduledEvent> {
    return updateEventWithGuild(this.context.guildId, eventId, updates);
  }

  async deleteEvent(eventId: string, teamLeaderId: string): Promise<void> {
    return deleteEventWithGuild(this.context.guildId, eventId, teamLeaderId);
  }

  async updateEventStatus(
    eventId: string,
    status: EventStatus,
  ): Promise<ScheduledEvent> {
    const event = await this.getEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    return this.updateEvent(eventId, { status });
  }

  async getEventsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ScheduledEvent[]> {
    const response = await this.getEvents({
      dateFrom: startDate.toISOString(),
      dateTo: endDate.toISOString(),
    });
    return response.data;
  }
}
