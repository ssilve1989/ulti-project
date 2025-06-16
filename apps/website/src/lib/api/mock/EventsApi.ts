import type {
  CreateEventRequest,
  CreateEventResponse,
  DeleteEventParams,
  DeleteEventQuery,
  DeleteEventResponse,
  GetEventParams,
  GetEventQuery,
  GetEventResponse,
  GetEventsQuery,
  GetEventsResponse,
  UpdateEventParams,
  UpdateEventQuery,
  UpdateEventRequest,
  UpdateEventResponse,
} from '@ulti-project/shared';
import { EventStatus } from '@ulti-project/shared';
import type { EventsApi } from '../interfaces/EventsApi.js';
import { MOCK_GUILD_ID, mockEvents } from './mockData.js';

export class EventsApiMock implements EventsApi {
  async getEvents(params: GetEventsQuery): Promise<GetEventsResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (params.guildId !== MOCK_GUILD_ID) {
      return {
        events: [],
        nextCursor: undefined,
        hasMore: false,
      };
    }

    let filteredEvents = [...mockEvents];

    // Apply filters
    if (params.teamLeaderId) {
      filteredEvents = filteredEvents.filter(
        (e) => e.teamLeaderId === params.teamLeaderId,
      );
    }
    if (params.status) {
      filteredEvents = filteredEvents.filter((e) => e.status === params.status);
    }
    if (params.encounter) {
      filteredEvents = filteredEvents.filter(
        (e) => e.encounter === params.encounter,
      );
    }
    if (params.dateFrom) {
      filteredEvents = filteredEvents.filter(
        (e) => e.scheduledTime >= params.dateFrom!,
      );
    }
    if (params.dateTo) {
      filteredEvents = filteredEvents.filter(
        (e) => e.scheduledTime <= params.dateTo!,
      );
    }

    // Sort by scheduled time
    filteredEvents.sort(
      (a, b) =>
        new Date(a.scheduledTime).getTime() -
        new Date(b.scheduledTime).getTime(),
    );

    // Apply pagination
    const limit = params.limit || 50;
    const events = filteredEvents.slice(0, limit).map((event) => ({
      ...event,
      guildId: params.guildId,
    }));

    return {
      events,
      nextCursor: filteredEvents.length > limit ? 'mock_cursor' : undefined,
      hasMore: filteredEvents.length > limit,
    };
  }

  async getEventById(
    params: GetEventParams,
    query: GetEventQuery,
  ): Promise<GetEventResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const event = mockEvents.find((e) => e.id === params.id);
    if (!event) {
      throw new Error('Event not found');
    }

    return {
      ...event,
      guildId: query.guildId,
    };
  }

  async createEvent(params: CreateEventRequest): Promise<CreateEventResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (params.guildId !== MOCK_GUILD_ID) {
      throw new Error('Guild not found');
    }

    const newEvent = {
      id: Math.random().toString(36).substr(2, 9),
      name: params.name,
      encounter: params.encounter,
      scheduledTime: params.scheduledTime,
      duration: params.duration,
      teamLeaderId: params.teamLeaderId,
      teamLeaderName: 'Mock Team Leader', // In a real app, this would be resolved from user data
      status: EventStatus.Draft,
      roster: {
        party: [],
        totalSlots: 8,
        filledSlots: 0,
      },
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      version: 1,
    };

    // Add to mock storage
    mockEvents.push(newEvent);

    return {
      ...newEvent,
      guildId: params.guildId,
    };
  }

  async updateEvent(
    params: UpdateEventParams,
    query: UpdateEventQuery,
    body: UpdateEventRequest,
  ): Promise<UpdateEventResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const eventIndex = mockEvents.findIndex((e) => e.id === params.id);
    if (eventIndex === -1) {
      throw new Error('Event not found');
    }

    const existingEvent = mockEvents[eventIndex];
    const updatedEvent = {
      ...existingEvent,
      ...body,
      // Ensure scheduledTime is always an ISO string
      scheduledTime:
        typeof body.scheduledTime === 'string'
          ? body.scheduledTime
          : body.scheduledTime
            ? new Date(body.scheduledTime).toISOString()
            : existingEvent.scheduledTime,
      // Ensure roster party slots have ISO string draftedAt
      roster: body.roster
        ? {
            ...body.roster,
            party: body.roster.party.map((slot) => ({
              ...slot,
              draftedAt: slot.draftedAt
                ? typeof slot.draftedAt === 'string'
                  ? slot.draftedAt
                  : slot.draftedAt.toISOString()
                : undefined,
            })),
          }
        : existingEvent.roster,
      lastModified: new Date().toISOString(),
      version: existingEvent.version + 1,
    };

    mockEvents[eventIndex] = updatedEvent;

    return {
      ...updatedEvent,
      guildId: query.guildId,
    };
  }

  async deleteEvent(
    params: DeleteEventParams,
    query: DeleteEventQuery,
  ): Promise<DeleteEventResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const eventIndex = mockEvents.findIndex((e) => e.id === params.id);
    if (eventIndex === -1) {
      throw new Error('Event not found');
    }

    // In a real scenario, you might check if the teamLeaderId matches
    mockEvents.splice(eventIndex, 1);

    return {
      success: true,
    };
  }
}
