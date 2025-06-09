import type { Encounter } from './encounters.js';
import type { Role } from './signup.js';

// Core scheduling types
export interface ScheduledEvent {
  id: string;
  name: string;
  encounter: Encounter;
  scheduledTime: Date;
  duration: number; // minutes
  teamLeaderId: string;
  teamLeaderName: string;
  status: 'draft' | 'published' | 'in-progress' | 'completed' | 'cancelled';
  roster: EventRoster;
  createdAt: Date;
  lastModified: Date;
  version: number; // Optimistic locking
}

export interface EventRoster {
  parties: PartySlot[][];
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
  type: 'helper' | 'progger';
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
}

export interface HelperJob {
  job: Job;
  role: Role;
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
  participantType: 'helper' | 'progger';
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
  status?: ScheduledEvent['status'];
}

export interface LockParticipantRequest {
  participantId: string;
  participantType: 'helper' | 'progger';
  slotId?: string;
}

export interface AssignParticipantRequest {
  participantId: string;
  participantType: 'helper' | 'progger';
  slotId: string;
  selectedJob: Job;
}

export interface EventFilters {
  teamLeaderId?: string;
  status?: ScheduledEvent['status'];
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

// Job type - specific to scheduling system
export type Job =
  // Tanks
  | 'Paladin'
  | 'Warrior'
  | 'Dark Knight'
  | 'Gunbreaker'
  // Healers
  | 'White Mage'
  | 'Scholar'
  | 'Astrologian'
  | 'Sage'
  // Melee DPS
  | 'Dragoon'
  | 'Monk'
  | 'Ninja'
  | 'Samurai'
  | 'Reaper'
  // Ranged Physical DPS
  | 'Bard'
  | 'Machinist'
  | 'Dancer'
  // Ranged Magical DPS
  | 'Black Mage'
  | 'Summoner'
  | 'Red Mage'
  | 'Blue Mage';
