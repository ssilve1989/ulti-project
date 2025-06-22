import type {
  CreateDraftLockRequest,
  DraftLock,
  ParticipantType,
} from '@ulti-project/shared';
import {
  getActiveLocksWithGuild,
  lockParticipantWithGuild,
  releaseAllLocksForTeamLeader,
  releaseLockWithGuild,
} from '../../../mock/drafts.js';
import type { IApiContext, ILocksApi } from '../../interfaces/index.js';

export class MockLocksApi implements ILocksApi {
  constructor(public readonly context: IApiContext) {}

  async lockParticipant(
    eventId: string,
    request: CreateDraftLockRequest,
  ): Promise<DraftLock> {
    // Convert CreateDraftLockRequest to LockParticipantRequest format
    const lockRequest = {
      participantId: request.participantId,
      participantType: request.participantType,
      slotId: request.slotId,
    };
    return lockParticipantWithGuild(this.context.guildId, eventId, lockRequest);
  }

  async releaseLock(
    eventId: string,
    participantType: ParticipantType,
    participantId: string,
  ): Promise<void> {
    // Use the guild-aware release function
    return releaseLockWithGuild(this.context.guildId, eventId, {
      participantId,
      teamLeaderId: 'default-team-leader', // Would come from context in real implementation
    });
  }

  async getActiveLocks(eventId: string): Promise<DraftLock[]> {
    return getActiveLocksWithGuild(this.context.guildId, eventId);
  }

  async getLocksForTeamLeader(
    eventId: string,
    teamLeaderId: string,
  ): Promise<DraftLock[]> {
    const allLocks = await this.getActiveLocks(eventId);
    return allLocks.filter((lock) => lock.lockedBy === teamLeaderId);
  }

  async releaseAllLocks(eventId: string, teamLeaderId: string): Promise<void> {
    // Use existing function
    return releaseAllLocksForTeamLeader(eventId, teamLeaderId);
  }

  async isParticipantLocked(
    eventId: string,
    participantId: string,
  ): Promise<{
    isLocked: boolean;
    lockInfo?: DraftLock;
  }> {
    const locks = await this.getActiveLocks(eventId);
    const lock = locks.find((lock) => lock.participantId === participantId);

    return {
      isLocked: !!lock,
      lockInfo: lock,
    };
  }

  async extendLock(eventId: string, lockId: string): Promise<DraftLock> {
    // Mock implementation - would extend the lock timeout
    const locks = await this.getActiveLocks(eventId);
    const lock = locks.find((l) => l.id === lockId);
    if (!lock) throw new Error(`Lock ${lockId} not found`);

    // Return the lock as-is for mock (real implementation would update expiry)
    return lock;
  }
}
