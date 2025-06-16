import {
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateEventRequest,
  DeleteEventParams,
  DeleteEventQuery,
  GetEventParams,
  GetEventQuery,
  GetEventResponse,
  GetEventsQuery,
  GetEventsResponse,
  UpdateEventParams,
  UpdateEventQuery,
  UpdateEventRequest,
} from '@ulti-project/shared';
import { eventsApi } from '../../lib/api/apiClient.js';

// Query hooks
export const useEventsQuery = (
  params: GetEventsQuery,
  options?: Omit<UseQueryOptions<GetEventsResponse>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => eventsApi.getEvents(params),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
};

export const useEventQuery = (
  params: GetEventParams,
  query: GetEventQuery,
  options?: Omit<UseQueryOptions<GetEventResponse>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery({
    queryKey: ['event', params.id, query],
    queryFn: () => eventsApi.getEventById(params, query),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
};

// Mutation hooks
export const useCreateEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateEventRequest) => eventsApi.createEvent(params),
    onSuccess: () => {
      // Invalidate events queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
};

export const useUpdateEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      params,
      query,
      body,
    }: {
      params: UpdateEventParams;
      query: UpdateEventQuery;
      body: UpdateEventRequest;
    }) => eventsApi.updateEvent(params, query, body),
    onSuccess: (data, variables) => {
      // Invalidate both the events list and the specific event
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({
        queryKey: ['event', variables.params.id],
      });
    },
  });
};

export const useDeleteEventMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      params,
      query,
    }: {
      params: DeleteEventParams;
      query: DeleteEventQuery;
    }) => eventsApi.deleteEvent(params, query),
    onSuccess: (data, variables) => {
      // Invalidate events queries and remove the specific event from cache
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.removeQueries({ queryKey: ['event', variables.params.id] });
    },
  });
};
