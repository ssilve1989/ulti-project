import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDraftLockParams,
  CreateDraftLockQuery,
  CreateDraftLockRequest,
  CreateDraftLockResponse,
  GetActiveLocksParams,
  GetActiveLocksQuery,
  GetLocksByTeamLeaderParams,
  GetLocksByTeamLeaderQuery,
  ReleaseAllLocksParams,
  ReleaseAllLocksQuery,
  ReleaseAllLocksResponse,
  ReleaseDraftLockParams,
  ReleaseDraftLockQuery,
  ReleaseDraftLockResponse,
} from '@ulti-project/shared';
import { locksApi } from '../../lib/api/apiClient.js';

// Query hooks
export const useActiveLocksQuery = (
  params: GetActiveLocksParams,
  query: GetActiveLocksQuery,
  options?: any,
) => {
  return useQuery({
    queryKey: ['locks', params.eventId, 'active', query],
    queryFn: () => locksApi.getActiveLocks(params, query),
    ...options,
  });
};

export const useLocksByTeamLeaderQuery = (
  params: GetLocksByTeamLeaderParams,
  query: GetLocksByTeamLeaderQuery,
  options?: any,
) => {
  return useQuery({
    queryKey: [
      'locks',
      params.eventId,
      'team-leader',
      params.teamLeaderId,
      query,
    ],
    queryFn: () => locksApi.getLocksByTeamLeader(params, query),
    ...options,
  });
};

// Mutation hooks
export const useCreateDraftLockMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: CreateDraftLockParams;
    query: CreateDraftLockQuery;
    body: CreateDraftLockRequest;
  };

  return useMutation<CreateDraftLockResponse, Error, MutationVariables>({
    mutationFn: ({ params, query, body }) =>
      locksApi.createDraftLock(params, query, body),
    onSuccess: (data, variables) => {
      // Invalidate locks queries
      queryClient.invalidateQueries({
        queryKey: ['locks', variables.params.eventId],
      });
    },
    ...options,
  });
};

export const useReleaseDraftLockMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: ReleaseDraftLockParams;
    query: ReleaseDraftLockQuery;
  };

  return useMutation<ReleaseDraftLockResponse, Error, MutationVariables>({
    mutationFn: ({ params, query }) => locksApi.releaseDraftLock(params, query),
    onSuccess: (data, variables) => {
      // Invalidate locks queries
      queryClient.invalidateQueries({
        queryKey: ['locks', variables.params.eventId],
      });
    },
    ...options,
  });
};

export const useReleaseAllLocksMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: ReleaseAllLocksParams;
    query: ReleaseAllLocksQuery;
  };

  return useMutation<ReleaseAllLocksResponse, Error, MutationVariables>({
    mutationFn: ({ params, query }) => locksApi.releaseAllLocks(params, query),
    onSuccess: (data, variables) => {
      // Invalidate locks queries
      queryClient.invalidateQueries({
        queryKey: ['locks', variables.params.eventId],
      });
    },
    ...options,
  });
};
