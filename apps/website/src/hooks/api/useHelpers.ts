import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CheckHelperAvailabilityParams,
  CheckHelperAvailabilityQuery,
  CreateHelperAbsenceParams,
  CreateHelperAbsenceQuery,
  CreateHelperAbsenceRequest,
  CreateHelperAbsenceResponse,
  GetHelperAbsencesParams,
  GetHelperAbsencesQuery,
  GetHelperParams,
  GetHelperQuery,
  GetHelpersQuery,
  SetHelperAvailabilityParams,
  SetHelperAvailabilityQuery,
  SetHelperAvailabilityRequest,
  SetHelperAvailabilityResponse,
} from '@ulti-project/shared';
import { helpersApi } from '../../lib/api/apiClient.js';

// Query hooks
export const useHelpersQuery = (params: GetHelpersQuery, options?: any) => {
  return useQuery({
    queryKey: ['helpers', params],
    queryFn: () => helpersApi.getHelpers(params),
    ...options,
  });
};

export const useHelperQuery = (
  params: GetHelperParams,
  query: GetHelperQuery,
  options?: any,
) => {
  return useQuery({
    queryKey: ['helper', params.id, query],
    queryFn: () => helpersApi.getHelperById(params, query),
    ...options,
  });
};

export const useHelperAvailabilityQuery = (
  params: CheckHelperAvailabilityParams,
  query: CheckHelperAvailabilityQuery,
  options?: any,
) => {
  return useQuery({
    queryKey: ['helper', params.id, 'availability', query],
    queryFn: () => helpersApi.checkHelperAvailability(params, query),
    ...options,
  });
};

export const useHelperAbsencesQuery = (
  params: GetHelperAbsencesParams,
  query: GetHelperAbsencesQuery,
  options?: any,
) => {
  return useQuery({
    queryKey: ['helper', params.id, 'absences', query],
    queryFn: () => helpersApi.getHelperAbsences(params, query),
    ...options,
  });
};

// Mutation hooks
export const useSetHelperAvailabilityMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: SetHelperAvailabilityParams;
    query: SetHelperAvailabilityQuery;
    body: SetHelperAvailabilityRequest;
  };

  return useMutation<SetHelperAvailabilityResponse, Error, MutationVariables>({
    mutationFn: ({ params, query, body }) =>
      helpersApi.setHelperAvailability(params, query, body),
    onSuccess: (data, variables) => {
      // Invalidate and refetch helper data
      queryClient.invalidateQueries({
        queryKey: ['helper', variables.params.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['helpers'],
      });
    },
    ...options,
  });
};

export const useCreateHelperAbsenceMutation = (options?: any) => {
  const queryClient = useQueryClient();

  type MutationVariables = {
    params: CreateHelperAbsenceParams;
    query: CreateHelperAbsenceQuery;
    body: CreateHelperAbsenceRequest;
  };

  return useMutation<CreateHelperAbsenceResponse, Error, MutationVariables>({
    mutationFn: ({ params, query, body }) =>
      helpersApi.createHelperAbsence(params, query, body),
    onSuccess: (data, variables) => {
      // Invalidate helper absences queries
      queryClient.invalidateQueries({
        queryKey: ['helper', variables.params.id, 'absences'],
      });
      queryClient.invalidateQueries({
        queryKey: ['helper', variables.params.id],
      });
    },
    ...options,
  });
};
