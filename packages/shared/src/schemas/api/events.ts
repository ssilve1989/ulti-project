import { z } from 'zod/v4';
import {
  EncounterSchema,
  EventRosterSchema,
  EventStatusSchema,
  ScheduledEventSchema,
} from './common.js';

// POST /events - Create Event
export const CreateEventRequestSchema = z.object({
  guildId: z.string(),
  name: z.string().min(1, 'Event name is required'),
  encounter: EncounterSchema,
  scheduledTime: z.coerce.date(),
  duration: z.number().positive('Duration must be positive'),
  teamLeaderId: z.string(),
  partyCount: z.number().positive().optional(),
});

export const CreateEventResponseSchema = ScheduledEventSchema.extend({
  guildId: z.string(),
});

// GET /events/:id - Get Single Event
export const GetEventParamsSchema = z.object({
  id: z.string(),
});

export const GetEventQuerySchema = z.object({
  guildId: z.string(),
});

export const GetEventResponseSchema = ScheduledEventSchema.extend({
  guildId: z.string(),
});

// GET /events - Get Events with Filters
export const GetEventsQuerySchema = z.object({
  guildId: z.string(),
  teamLeaderId: z.string().optional(),
  status: EventStatusSchema.optional(),
  encounter: EncounterSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export const GetEventsResponseSchema = z.object({
  events: z.array(ScheduledEventSchema.extend({ guildId: z.string() })),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
});

// PUT /events/:id - Update Event
export const UpdateEventParamsSchema = z.object({
  id: z.string(),
});

export const UpdateEventQuerySchema = z.object({
  guildId: z.string(),
});

export const UpdateEventRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    scheduledTime: z.coerce.date().optional(),
    duration: z.number().positive().optional(),
    status: EventStatusSchema.optional(),
    roster: EventRosterSchema.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update',
  );

export const UpdateEventResponseSchema = ScheduledEventSchema.extend({
  guildId: z.string(),
});

// DELETE /events/:id - Delete Event
export const DeleteEventParamsSchema = z.object({
  id: z.string(),
});

export const DeleteEventQuerySchema = z.object({
  guildId: z.string(),
  teamLeaderId: z.string(),
});

export const DeleteEventResponseSchema = z.object({
  success: z.boolean(),
});

// Inferred types
export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;
export type CreateEventResponse = z.infer<typeof CreateEventResponseSchema>;
export type GetEventParams = z.infer<typeof GetEventParamsSchema>;
export type GetEventQuery = z.infer<typeof GetEventQuerySchema>;
export type GetEventResponse = z.infer<typeof GetEventResponseSchema>;
export type GetEventsQuery = z.infer<typeof GetEventsQuerySchema>;
export type GetEventsResponse = z.infer<typeof GetEventsResponseSchema>;
export type UpdateEventParams = z.infer<typeof UpdateEventParamsSchema>;
export type UpdateEventQuery = z.infer<typeof UpdateEventQuerySchema>;
export type UpdateEventRequest = z.infer<typeof UpdateEventRequestSchema>;
export type UpdateEventResponse = z.infer<typeof UpdateEventResponseSchema>;
export type DeleteEventParams = z.infer<typeof DeleteEventParamsSchema>;
export type DeleteEventQuery = z.infer<typeof DeleteEventQuerySchema>;
export type DeleteEventResponse = z.infer<typeof DeleteEventResponseSchema>;
