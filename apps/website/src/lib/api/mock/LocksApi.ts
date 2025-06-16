import type {
  CreateDraftLockParams,
  CreateDraftLockQuery,
  CreateDraftLockRequest,
  CreateDraftLockResponse,
  GetActiveLocksParams,
  GetActiveLocksQuery,
  GetActiveLocksResponse,
  GetLocksByTeamLeaderParams,
  GetLocksByTeamLeaderQuery,
  GetLocksByTeamLeaderResponse,
  ReleaseAllLocksParams,
  ReleaseAllLocksQuery,
  ReleaseAllLocksResponse,
  ReleaseDraftLockParams,
  ReleaseDraftLockQuery,
  ReleaseDraftLockResponse,
} from '@ulti-project/shared';
import type { LocksApi } from '../interfaces/LocksApi.js';
import { MOCK_GUILD_ID, mockDraftLocks } from './mockData.js';

export class LocksApiMock implements LocksApi {
  async getActiveLocks(
    params: GetActiveLocksParams,
    query: GetActiveLocksQuery,
  ): Promise<GetActiveLocksResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      return [];
    }

    const eventLocks = mockDraftLocks.get(params.eventId) || [];
    const now = new Date();

    // Filter out expired locks
    const activeLocks = eventLocks.filter(
      (lock) => new Date(lock.expiresAt) > now,
    );

    // Update the storage to remove expired locks
    mockDraftLocks.set(params.eventId, activeLocks);

    return activeLocks.map((lock) => ({
      ...lock,
      guildId: query.guildId,
    }));
  }

  async createDraftLock(
    params: CreateDraftLockParams,
    query: CreateDraftLockQuery,
    body: CreateDraftLockRequest,
  ): Promise<CreateDraftLockResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Event not found');
    }

    const existingLocks = mockDraftLocks.get(params.eventId) || [];

    // Check if participant already has a lock
    const existingLock = existingLocks.find(
      (lock) =>
        lock.participantId === body.participantId &&
        lock.participantType === body.participantType,
    );

    if (existingLock) {
      // Extend existing lock
      existingLock.expiresAt = new Date(
        Date.now() + 15 * 60 * 1000,
      ).toISOString(); // 15 minutes from now
      existingLock.lockedBy = query.teamLeaderId;
      existingLock.lockedByName = `Team Leader ${query.teamLeaderId.substring(0, 8)}`;

      return {
        ...existingLock,
        guildId: query.guildId,
      };
    }

    // Create new lock
    const newLock = {
      id: Math.random().toString(36).substr(2, 9),
      eventId: params.eventId,
      participantType: body.participantType,
      participantId: body.participantId,
      lockedBy: query.teamLeaderId,
      lockedByName: `Team Leader ${query.teamLeaderId.substring(0, 8)}`,
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
    };

    // Add to storage
    mockDraftLocks.set(params.eventId, [...existingLocks, newLock]);

    return {
      ...newLock,
      guildId: query.guildId,
    };
  }

  async releaseDraftLock(
    params: ReleaseDraftLockParams,
    query: ReleaseDraftLockQuery,
  ): Promise<ReleaseDraftLockResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      throw new Error('Lock not found');
    }

    const existingLocks = mockDraftLocks.get(params.eventId) || [];

    // Find and remove the specific lock
    const lockIndex = existingLocks.findIndex(
      (lock) =>
        lock.participantId === params.participantId &&
        lock.participantType === params.participantType &&
        lock.lockedBy === query.teamLeaderId,
    );

    if (lockIndex === -1) {
      throw new Error('Lock not found or unauthorized');
    }

    // Remove the lock
    existingLocks.splice(lockIndex, 1);
    mockDraftLocks.set(params.eventId, existingLocks);

    return {
      success: true,
    };
  }

  async releaseAllLocks(
    params: ReleaseAllLocksParams,
    query: ReleaseAllLocksQuery,
  ): Promise<ReleaseAllLocksResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (query.guildId !== MOCK_GUILD_ID) {
      return {
        success: false,
        releasedLocks: 0,
      };
    }

    const existingLocks = mockDraftLocks.get(params.eventId) || [];

    // Find locks belonging to the team leader
    const teamLeaderLocks = existingLocks.filter(
      (lock) => lock.lockedBy === params.teamLeaderId,
    );
    const remainingLocks = existingLocks.filter(
      (lock) => lock.lockedBy !== params.teamLeaderId,
    );

    // Update storage with remaining locks
    mockDraftLocks.set(params.eventId, remainingLocks);

    return {
      success: true,
      releasedLocks: teamLeaderLocks.length,
    };
  }

  async getLocksByTeamLeader(
    params: GetLocksByTeamLeaderParams,
    query: GetLocksByTeamLeaderQuery,
  ): Promise<GetLocksByTeamLeaderResponse> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (query.guildId !== MOCK_GUILD_ID) {
      return [];
    }

    const existingLocks = mockDraftLocks.get(params.eventId) || [];
    const now = new Date();

    // Filter by team leader and active locks
    const teamLeaderLocks = existingLocks.filter(
      (lock) =>
        lock.lockedBy === params.teamLeaderId && new Date(lock.expiresAt) > now,
    );

    return teamLeaderLocks.map((lock) => ({
      ...lock,
      guildId: query.guildId,
    }));
  }
}
