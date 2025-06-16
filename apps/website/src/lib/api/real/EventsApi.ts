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
import type { EventsApi } from '../interfaces/EventsApi.js';
import { BaseApi } from './BaseApi.js';

export class EventsApiImpl extends BaseApi implements EventsApi {
  async getEvents(params: GetEventsQuery): Promise<GetEventsResponse> {
    const queryString = this.buildQueryParams(params);
    return this.makeRequest(`/events?${queryString}`);
  }

  async getEventById(
    params: GetEventParams,
    query: GetEventQuery,
  ): Promise<GetEventResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/events/${params.id}?${queryString}`);
  }

  async createEvent(params: CreateEventRequest): Promise<CreateEventResponse> {
    return this.makeRequest('/events', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async updateEvent(
    params: UpdateEventParams,
    query: UpdateEventQuery,
    body: UpdateEventRequest,
  ): Promise<UpdateEventResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/events/${params.id}?${queryString}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteEvent(
    params: DeleteEventParams,
    query: DeleteEventQuery,
  ): Promise<DeleteEventResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/events/${params.id}?${queryString}`, {
      method: 'DELETE',
    });
  }
}
