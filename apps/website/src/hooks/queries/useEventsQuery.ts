import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventFilters, CreateEventRequest, UpdateEventRequest } from '@ulti-project/shared';
import { api } from '../../lib/api/client.js';

// Query keys
export const eventsQueryKeys = {
  all: ['events'] as const,
  lists: () => [...eventsQueryKeys.all, 'list'] as const,
  list: (filters?: EventFilters) => [...eventsQueryKeys.lists(), filters] as const,
  details: () => [...eventsQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...eventsQueryKeys.details(), id] as const,
};

// Get events list
export function useEventsQuery(filters?: EventFilters) {
  return useQuery({
    queryKey: eventsQueryKeys.list(filters),
    queryFn: async () => {
      const response = await api.events.getEvents(filters);
      return response.data || response; // Handle both paginated and direct responses
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Get single event
export function useEventQuery(eventId: string) {
  return useQuery({
    queryKey: eventsQueryKeys.detail(eventId),
    queryFn: () => api.events.getEvent(eventId),
    staleTime: 60 * 1000, // 1 minute
    enabled: !!eventId,
  });
}

// Create event mutation
export function useCreateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateEventRequest) => api.events.createEvent(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
  });
}

// Update event mutation
export function useUpdateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, updates }: { eventId: string; updates: UpdateEventRequest }) =>
      api.events.updateEvent(eventId, updates),
    onSuccess: (updatedEvent) => {
      queryClient.setQueryData(eventsQueryKeys.detail(updatedEvent.id), updatedEvent);
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
  });
}

// Delete event mutation
export function useDeleteEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, teamLeaderId }: { eventId: string; teamLeaderId: string }) =>
      api.events.deleteEvent(eventId, teamLeaderId),
    onSuccess: (_, { eventId }) => {
      queryClient.removeQueries({ queryKey: eventsQueryKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
  });
}