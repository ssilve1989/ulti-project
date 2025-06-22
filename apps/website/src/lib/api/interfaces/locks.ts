import type {
  CreateDraftLockRequest,
  DraftLock,
  ParticipantType,
} from '@ulti-project/shared';
import type { IBaseApi } from './base.js';

/**
 * Locks API interface defining all draft lock management operations
 * Handles participant locking to prevent concurrent roster editing
 */
export interface ILocksApi extends IBaseApi {
  /**
   * Lock a participant for draft editing
   */
  lockParticipant(
    eventId: string,
    request: CreateDraftLockRequest,
  ): Promise<DraftLock>;

  /**
   * Release a participant lock
   */
  releaseLock(
    eventId: string,
    participantType: ParticipantType,
    participantId: string,
  ): Promise<void>;

  /**
   * Get all active locks for an event
   */
  getActiveLocks(eventId: string): Promise<DraftLock[]>;

  /**
   * Get locks held by a specific team leader
   */
  getLocksForTeamLeader(
    eventId: string,
    teamLeaderId: string,
  ): Promise<DraftLock[]>;

  /**
   * Release all locks for a team leader (cleanup on disconnect)
   */
  releaseAllLocks(eventId: string, teamLeaderId: string): Promise<void>;

  /**
   * Check if a participant is currently locked
   */
  isParticipantLocked(
    eventId: string,
    participantId: string,
  ): Promise<{
    isLocked: boolean;
    lockInfo?: DraftLock;
  }>;

  /**
   * Extend lock duration (refresh timeout)
   */
  extendLock(eventId: string, lockId: string): Promise<DraftLock>;
}
