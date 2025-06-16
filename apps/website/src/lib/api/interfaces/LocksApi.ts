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

export interface LocksApi {
  getActiveLocks(
    params: GetActiveLocksParams,
    query: GetActiveLocksQuery,
  ): Promise<GetActiveLocksResponse>;
  createDraftLock(
    params: CreateDraftLockParams,
    query: CreateDraftLockQuery,
    body: CreateDraftLockRequest,
  ): Promise<CreateDraftLockResponse>;
  releaseDraftLock(
    params: ReleaseDraftLockParams,
    query: ReleaseDraftLockQuery,
  ): Promise<ReleaseDraftLockResponse>;
  releaseAllLocks(
    params: ReleaseAllLocksParams,
    query: ReleaseAllLocksQuery,
  ): Promise<ReleaseAllLocksResponse>;
  getLocksByTeamLeader(
    params: GetLocksByTeamLeaderParams,
    query: GetLocksByTeamLeaderQuery,
  ): Promise<GetLocksByTeamLeaderResponse>;
}
