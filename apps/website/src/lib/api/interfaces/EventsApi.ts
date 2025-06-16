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

export interface EventsApi {
  getEvents(params: GetEventsQuery): Promise<GetEventsResponse>;
  getEventById(
    params: GetEventParams,
    query: GetEventQuery,
  ): Promise<GetEventResponse>;
  createEvent(params: CreateEventRequest): Promise<CreateEventResponse>;
  updateEvent(
    params: UpdateEventParams,
    query: UpdateEventQuery,
    body: UpdateEventRequest,
  ): Promise<UpdateEventResponse>;
  deleteEvent(
    params: DeleteEventParams,
    query: DeleteEventQuery,
  ): Promise<DeleteEventResponse>;
}
