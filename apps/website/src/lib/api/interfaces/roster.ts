import type {
  AssignParticipantRequest,
  Job,
  Participant,
  ParticipantType,
  Role,
  ScheduledEvent,
} from '@ulti-project/shared';
import type { IBaseApi } from './base.js';

/**
 * Roster API interface defining all roster and participant management operations
 * Handles participant assignment, party composition, and roster validation
 */
export interface IRosterApi extends IBaseApi {
  /**
   * Get all participants (helpers and proggers) with optional filtering
   */
  getParticipants(filters?: {
    encounter?: string;
    type?: ParticipantType;
    role?: Role;
    job?: Job;
  }): Promise<Participant[]>;

  /**
   * Get participants specifically for an event
   */
  getEventParticipants(eventId: string): Promise<Participant[]>;

  /**
   * Assign a participant to an event roster slot
   */
  assignParticipant(
    eventId: string,
    request: AssignParticipantRequest,
  ): Promise<ScheduledEvent>;

  /**
   * Unassign a participant from an event roster slot
   */
  unassignParticipant(eventId: string, slotId: string): Promise<ScheduledEvent>;

  /**
   * Get the complete roster for an event
   */
  getEventRoster(eventId: string): Promise<ScheduledEvent>;

  /**
   * Validate party composition for an event
   */
  validatePartyComposition(eventId: string): Promise<{
    isValid: boolean;
    violations: string[];
    suggestions: string[];
  }>;

  /**
   * Get available participants for a specific event slot
   */
  getAvailableParticipants(
    eventId: string,
    slotType: Role,
    preferredJob?: Job,
  ): Promise<Participant[]>;

  /**
   * Swap participants between two roster slots
   */
  swapParticipants(
    eventId: string,
    participant1Id: string,
    participant2Id: string,
  ): Promise<ScheduledEvent>;
}
