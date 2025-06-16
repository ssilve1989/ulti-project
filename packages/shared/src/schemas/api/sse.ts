import { z } from 'zod/v4';
import {
  DraftLockSchema,
  HelperDataSchema,
  HelperWeeklyAvailabilitySchema,
  ParticipantSchema,
  ScheduledEventSchema,
} from './common.js';

// Individual SSE event schemas
export const EventUpdatedEventSchema = z.object({
  type: z.literal('event_updated'),
  data: z.object({
    eventId: z.string(),
    event: ScheduledEventSchema,
    changes: ScheduledEventSchema.partial(),
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

export const ParticipantAssignedEventSchema = z.object({
  type: z.literal('participant_assigned'),
  data: z.object({
    eventId: z.string(),
    slotId: z.string(),
    participant: ParticipantSchema,
    assignedBy: z.string(),
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

export const ParticipantUnassignedEventSchema = z.object({
  type: z.literal('participant_unassigned'),
  data: z.object({
    eventId: z.string(),
    slotId: z.string(),
    assignedBy: z.string(),
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

export const HelpersUpdatedEventSchema = z.object({
  type: z.literal('helpers_updated'),
  data: z.array(HelperDataSchema),
  timestamp: z.iso.datetime({ offset: true }),
});

export const HelperAvailabilityChangedEventSchema = z.object({
  type: z.literal('helper_availability_changed'),
  data: z.object({
    helperId: z.string(),
    availability: z.array(HelperWeeklyAvailabilitySchema),
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

export const DraftLockCreatedEventSchema = z.object({
  type: z.literal('draft_lock_created'),
  data: z.object({
    eventId: z.string(),
    lock: DraftLockSchema,
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

export const DraftLockReleasedEventSchema = z.object({
  type: z.literal('draft_lock_released'),
  data: z.object({
    eventId: z.string(),
    lock: DraftLockSchema,
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

export const DraftLockExpiredEventSchema = z.object({
  type: z.literal('draft_lock_expired'),
  data: z.object({
    eventId: z.string(),
    lock: DraftLockSchema,
  }),
  timestamp: z.iso.datetime({ offset: true }),
});

// Discriminated unions for each SSE stream
export const EventStreamEventSchema = z.discriminatedUnion('type', [
  EventUpdatedEventSchema,
  ParticipantAssignedEventSchema,
  ParticipantUnassignedEventSchema,
]);

export const HelperStreamEventSchema = z.discriminatedUnion('type', [
  HelpersUpdatedEventSchema,
  HelperAvailabilityChangedEventSchema,
]);

export const LockStreamEventSchema = z.discriminatedUnion('type', [
  DraftLockCreatedEventSchema,
  DraftLockReleasedEventSchema,
  DraftLockExpiredEventSchema,
]);

// All possible SSE events
export const SchedulingSSEEventSchema = z.discriminatedUnion('type', [
  EventUpdatedEventSchema,
  ParticipantAssignedEventSchema,
  ParticipantUnassignedEventSchema,
  HelpersUpdatedEventSchema,
  HelperAvailabilityChangedEventSchema,
  DraftLockCreatedEventSchema,
  DraftLockReleasedEventSchema,
  DraftLockExpiredEventSchema,
]);

// Inferred types
export type EventUpdatedEvent = z.infer<typeof EventUpdatedEventSchema>;
export type ParticipantAssignedEvent = z.infer<
  typeof ParticipantAssignedEventSchema
>;
export type ParticipantUnassignedEvent = z.infer<
  typeof ParticipantUnassignedEventSchema
>;
export type HelpersUpdatedEvent = z.infer<typeof HelpersUpdatedEventSchema>;
export type HelperAvailabilityChangedEvent = z.infer<
  typeof HelperAvailabilityChangedEventSchema
>;
export type DraftLockCreatedEvent = z.infer<typeof DraftLockCreatedEventSchema>;
export type DraftLockReleasedEvent = z.infer<
  typeof DraftLockReleasedEventSchema
>;
export type DraftLockExpiredEvent = z.infer<typeof DraftLockExpiredEventSchema>;
export type EventStreamEvent = z.infer<typeof EventStreamEventSchema>;
export type HelperStreamEvent = z.infer<typeof HelperStreamEventSchema>;
export type LockStreamEvent = z.infer<typeof LockStreamEventSchema>;
export type SchedulingSSEEvent = z.infer<typeof SchedulingSSEEventSchema>;
