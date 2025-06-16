import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignParticipantParams,
  AssignParticipantQuery,
  AssignParticipantRequest,
  AssignParticipantResponse,
  GetEventRosterParams,
  GetEventRosterQuery,
  UnassignParticipantParams,
  UnassignParticipantQuery,
  UnassignParticipantResponse,
} from '@ulti-project/shared';
import { rosterApi } from '../../lib/api/apiClient.js';

// Query hooks
export const useEventRosterQuery = (
  params: GetEventRosterParams,
  query: GetEventRosterQuery,
  options?: any,
) => {
  return useQuery({
    queryKey: ['roster', params.eventId, query],
    queryFn: () => rosterApi.getEventRoster(params, query),
    ...options,
  });
};

// Mutation hooks
export const useAssignParticipantMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: AssignParticipantParams;
    query: AssignParticipantQuery;
    body: AssignParticipantRequest;
  };

  return useMutation<AssignParticipantResponse, Error, MutationVariables>({
    mutationFn: ({ params, query, body }) =>
      rosterApi.assignParticipant(params, query, body),
    onSuccess: (data, variables) => {
      // Invalidate event and roster queries
      queryClient.invalidateQueries({
        queryKey: ['roster', variables.params.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['event', variables.params.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['events'],
      });
    },
    ...options,
  });
};

export const useUnassignParticipantMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: UnassignParticipantParams;
    query: UnassignParticipantQuery;
  };

  return useMutation<UnassignParticipantResponse, Error, MutationVariables>({
    mutationFn: ({ params, query }) =>
      rosterApi.unassignParticipant(params, query),
    onSuccess: (data, variables) => {
      // Invalidate event and roster queries
      queryClient.invalidateQueries({
        queryKey: ['roster', variables.params.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['event', variables.params.eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['events'],
      });
    },
    ...options,
  });
};
