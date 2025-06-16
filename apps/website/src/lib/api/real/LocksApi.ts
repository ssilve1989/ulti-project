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
import { BaseApi } from './BaseApi.js';

export class LocksApiImpl extends BaseApi implements LocksApi {
  async getActiveLocks(
    params: GetActiveLocksParams,
    query: GetActiveLocksQuery,
  ): Promise<GetActiveLocksResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/events/${params.eventId}/locks?${queryString}`);
  }

  async createDraftLock(
    params: CreateDraftLockParams,
    query: CreateDraftLockQuery,
    body: CreateDraftLockRequest,
  ): Promise<CreateDraftLockResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(`/events/${params.eventId}/locks?${queryString}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async releaseDraftLock(
    params: ReleaseDraftLockParams,
    query: ReleaseDraftLockQuery,
  ): Promise<ReleaseDraftLockResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(
      `/events/${params.eventId}/locks/${params.participantType}/${params.participantId}?${queryString}`,
      {
        method: 'DELETE',
      },
    );
  }

  async releaseAllLocks(
    params: ReleaseAllLocksParams,
    query: ReleaseAllLocksQuery,
  ): Promise<ReleaseAllLocksResponse> {
    const queryString = this.buildQueryParams(query);
    return this.makeRequest(
      `/events/${params.eventId}/locks/team-leader/${params.teamLeaderId}?${queryString}`,
      {
        method: 'DELETE',
      },
    );
  }

  async getLocksByTeamLeader(
    params: GetLocksByTeamLeaderParams,
    query: GetLocksByTeamLeaderQuery,
  ): Promise<GetLocksByTeamLeaderResponse> {
    // This might be a filter on the main locks endpoint
    // or there might be a dedicated endpoint - check backend implementation
    const queryString = this.buildQueryParams({
      ...query,
      teamLeaderId: params.teamLeaderId,
    });
    return this.makeRequest(`/events/${params.eventId}/locks?${queryString}`);
  }
}
