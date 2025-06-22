import type {
  CreateEventRequest,
  EventFilters,
  EventStatus,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';
import type { IBaseApi, IPaginatedResponse } from './base.js';

/**
 * Events API interface defining all event management operations
 * All methods require guild context for multi-tenant support
 */
export interface IEventsApi extends IBaseApi {
  /**
   * Create a new event in the specified guild
   */
  createEvent(request: CreateEventRequest): Promise<ScheduledEvent>;

  /**
   * Get a specific event by ID
   */
  getEvent(eventId: string): Promise<ScheduledEvent | null>;

  /**
   * Get events with optional filtering and pagination
   */
  getEvents(
    filters?: EventFilters,
  ): Promise<IPaginatedResponse<ScheduledEvent>>;

  /**
   * Update an existing event
   */
  updateEvent(
    eventId: string,
    updates: UpdateEventRequest,
  ): Promise<ScheduledEvent>;

  /**
   * Delete an event (requires team leader permission)
   */
  deleteEvent(eventId: string, teamLeaderId: string): Promise<void>;

  /**
   * Update event status
   */
  updateEventStatus(
    eventId: string,
    status: EventStatus,
  ): Promise<ScheduledEvent>;

  /**
   * Get events by date range
   */
  getEventsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ScheduledEvent[]>;
}
