import type {
  EventStatus,
  Job,
  ParticipantType,
  Role,
} from '../schemas/api/common.js';
import { Encounter } from './encounters.js';

/**
 * Scheduling system types for the Ulti-Project
 *
 * This file contains all TypeScript types used across the scheduling system,
 * including core data structures, API request/response types, SSE event types,
 * and error handling types.
 *
 * Recent additions include:
 * - HelperAvailabilityResponse for availability check endpoints
 * - SetHelperAvailabilityRequest and CreateAbsenceRequest for helper management
 * - APIErrorCodes and APIErrorMessages for standardized error handling
 * - Additional SSE event types for real-time updates
 */

// Core scheduling types
export interface ScheduledEvent {
  id: string;
  name: string;
  encounter: Encounter;
  scheduledTime: Date;
  duration: number; // minutes
  teamLeaderId: string;
  teamLeaderName: string;
  status: EventStatus;
  roster: EventRoster;
  createdAt: Date;
  lastModified: Date;
  version: number; // Optimistic locking
}

export interface EventRoster {
  party: PartySlot[];
  totalSlots: number;
  filledSlots: number;
}

export interface PartySlot {
  id: string;
  role: Role;
  jobRestriction?: Job;
  assignedParticipant?: Participant;
  isHelperSlot: boolean;
  draftedBy?: string; // Team leader ID if currently in draft
  draftedAt?: Date;
}

export interface Participant {
  type: ParticipantType;
  id: string; // helperId or signupId
  discordId: string;
  name: string;
  characterName?: string;
  job: Job;
  encounter?: Encounter; // For proggers
  progPoint?: string; // For proggers
  availability?: string; // For proggers - free-form text
  isConfirmed: boolean;
}

export interface HelperData {
  id: string;
  discordId: string;
  name: string;
  availableJobs: HelperJob[];
  weeklyAvailability?: HelperWeeklyAvailability[];
}

export interface HelperJob {
  job: Job;
  role: Role;
}

export interface HelperWeeklyAvailability {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  timeRanges: HelperTimeRange[];
}

export interface HelperTimeRange {
  start: string; // 24-hour format: "14:00"
  end: string; // 24-hour format: "18:00"
  timezone?: string; // e.g., "America/New_York", defaults to server timezone
}

export interface HelperAbsence {
  id: string;
  helperId: string;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

export interface DraftLock {
  id: string;
  eventId: string;
  participantId: string;
  participantType: ParticipantType;
  lockedBy: string; // Team leader ID
  lockedByName: string; // Team leader name
  lockedAt: Date;
  expiresAt: Date; // 30 minutes from lockedAt
}

// API Request/Response types
export interface CreateEventRequest {
  name: string;
  encounter: Encounter;
  scheduledTime: Date;
  duration: number;
  teamLeaderId: string;
  partyCount?: number;
}

export interface UpdateEventRequest {
  name?: string;
  scheduledTime?: Date;
  duration?: number;
  status?: EventStatus;
  roster?: EventRoster;
}

export interface LockParticipantRequest {
  participantId: string;
  participantType: ParticipantType;
  slotId?: string;
}

export interface AssignParticipantRequest {
  participantId: string;
  participantType: ParticipantType;
  slotId: string;
  selectedJob: Job;
}

export interface EventFilters {
  teamLeaderId?: string;
  status?: EventStatus;
  encounter?: Encounter;
  dateFrom?: Date;
  dateTo?: Date;
}

// SSE Event types
export interface SSEEvent<T = any> {
  type: string;
  data: T;
  timestamp: Date;
}

export interface EventUpdateEvent extends SSEEvent {
  type: 'event_updated';
  data: {
    eventId: string;
    event: ScheduledEvent;
    changes: Partial<ScheduledEvent>;
  };
}

export interface DraftLockEvent extends SSEEvent {
  type: 'draft_lock_created' | 'draft_lock_released' | 'draft_lock_expired';
  data: {
    eventId: string;
    lock: DraftLock;
  };
}

export interface ParticipantAssignedEvent extends SSEEvent {
  type: 'participant_assigned' | 'participant_unassigned';
  data: {
    eventId: string;
    slotId: string;
    participant?: Participant;
    assignedBy: string;
  };
}

// Error types
export interface APIError {
  code: string;
  message: string;
  details?: any;
}

export interface ConflictError extends APIError {
  code: 'CONFLICT';
  conflictType:
    | 'already_selected'
    | 'being_drafted'
    | 'unavailable'
    | 'helper_conflict';
  conflictDetails: {
    currentHolder?: string;
    lockExpiresAt?: Date;
    conflictingEventId?: string;
  };
}

// API Response types
export interface HelperAvailabilityResponse {
  available: boolean;
  reason?: 'absent' | 'outside_schedule' | 'available';
}

export interface SetHelperAvailabilityRequest {
  weeklyAvailability: HelperWeeklyAvailability[];
}

export interface CreateAbsenceRequest {
  startDate: Date;
  endDate: Date;
  reason?: string;
}

// Error codes as const assertions for better type safety
export const APIErrorCodes = {
  // Event errors
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  EVENT_IN_PROGRESS: 'EVENT_IN_PROGRESS',
  INVALID_EVENT_STATUS: 'INVALID_EVENT_STATUS',

  // Participant errors
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  PARTICIPANT_LOCKED: 'PARTICIPANT_LOCKED',
  PARTICIPANT_UNAVAILABLE: 'PARTICIPANT_UNAVAILABLE',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  SLOT_ALREADY_FILLED: 'SLOT_ALREADY_FILLED',

  // Lock errors
  LOCK_NOT_FOUND: 'LOCK_NOT_FOUND',
  LOCK_EXPIRED: 'LOCK_EXPIRED',
  LOCK_HELD_BY_OTHER: 'LOCK_HELD_BY_OTHER',

  // Validation errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
} as const;

export type APIErrorCode = (typeof APIErrorCodes)[keyof typeof APIErrorCodes];

// Error messages mapping
export const APIErrorMessages: Record<APIErrorCode, string> = {
  [APIErrorCodes.EVENT_NOT_FOUND]: 'Event does not exist',
  [APIErrorCodes.EVENT_IN_PROGRESS]:
    'Cannot modify events that are in progress',
  [APIErrorCodes.INVALID_EVENT_STATUS]: 'Invalid status transition',

  [APIErrorCodes.PARTICIPANT_NOT_FOUND]: 'Participant does not exist',
  [APIErrorCodes.PARTICIPANT_LOCKED]:
    'Participant is locked by another team leader',
  [APIErrorCodes.PARTICIPANT_UNAVAILABLE]:
    'Participant is not available at this time',
  [APIErrorCodes.SLOT_NOT_FOUND]: 'Roster slot does not exist',
  [APIErrorCodes.SLOT_ALREADY_FILLED]: 'Roster slot is already assigned',

  [APIErrorCodes.LOCK_NOT_FOUND]: 'Draft lock does not exist',
  [APIErrorCodes.LOCK_EXPIRED]: 'Draft lock has expired',
  [APIErrorCodes.LOCK_HELD_BY_OTHER]: 'Lock is held by another team leader',

  [APIErrorCodes.INVALID_REQUEST]: 'Request validation failed',
  [APIErrorCodes.MISSING_REQUIRED_FIELD]: 'Required field is missing',
  [APIErrorCodes.INVALID_DATE_RANGE]: 'Invalid date range specified',
};

// SSE Event data types for better type safety
export interface HelperAvailabilityChangedEvent extends SSEEvent {
  type: 'helper_availability_changed';
  data: {
    helperId: string;
    availability: HelperWeeklyAvailability[];
  };
}

export interface HelpersUpdatedEvent extends SSEEvent {
  type: 'helpers_updated';
  data: HelperData[];
}

// Union type for all SSE events
export type SchedulingSSEEvent =
  | EventUpdateEvent
  | DraftLockEvent
  | ParticipantAssignedEvent
  | HelperAvailabilityChangedEvent
  | HelpersUpdatedEvent;
