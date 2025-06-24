import type { IEventsApi, IApiContext, IPaginatedResponse } from '../../interfaces/index.js';
import type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  EventStatus
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpEventsApi extends BaseHttpClient implements IEventsApi {
  constructor(
    config: { baseUrl: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'POST',
      path: '/api/events',
      body: { ...request, guildId: this.context.guildId }
    });
  }

  async getEvent(eventId: string): Promise<ScheduledEvent | null> {
    try {
      return await this.request<ScheduledEvent>({
        method: 'GET',
        path: `/api/events/${eventId}`,
        params: { guildId: this.context.guildId }
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ApiError' && (error as any).isNotFound()) {
        return null;
      }
      throw error;
    }
  }

  async getEvents(filters?: EventFilters): Promise<IPaginatedResponse<ScheduledEvent>> {
    const params: Record<string, string> = {
      guildId: this.context.guildId
    };
    
    if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters?.dateTo) params.dateTo = filters.dateTo;
    if (filters?.status) params.status = filters.status;
    if (filters?.encounter) params.encounter = filters.encounter;

    const response = await this.request<{
      events: ScheduledEvent[];
      total: number;
      hasMore: boolean;
      nextCursor?: string;
    }>({
      method: 'GET',
      path: '/api/events',
      params
    });

    return {
      data: response.events,
      total: response.total,
      hasMore: response.hasMore,
      nextCursor: response.nextCursor
    };
  }

  async updateEvent(eventId: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'PUT',
      path: `/api/events/${eventId}`,
      body: { ...updates, guildId: this.context.guildId }
    });
  }

  async deleteEvent(eventId: string, teamLeaderId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/events/${eventId}`,
      params: { guildId: this.context.guildId, teamLeaderId }
    });
  }

  async updateEventStatus(eventId: string, status: EventStatus): Promise<ScheduledEvent> {
    return this.updateEvent(eventId, { status });
  }

  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<ScheduledEvent[]> {
    const response = await this.getEvents({
      dateFrom: startDate.toISOString(),
      dateTo: endDate.toISOString()
    });
    return response.data;
  }
}