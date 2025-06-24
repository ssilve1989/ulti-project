import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventFilters, CreateEventRequest, UpdateEventRequest, AssignParticipantRequest, CreateDraftLockRequest, ParticipantType } from '@ulti-project/shared';
import { api } from '../../lib/api/client.js';
import { helpersQueryKeys, participantsQueryKeys, locksQueryKeys } from './useHelpersQuery.js';

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

// Roster management mutations
export function useAssignParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, request }: { eventId: string; request: AssignParticipantRequest }) =>
      api.roster.assignParticipant(eventId, request),
    onSuccess: (updatedEvent, { eventId }) => {
      // Update the specific event
      queryClient.setQueryData(eventsQueryKeys.detail(eventId), updatedEvent);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: participantsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: locksQueryKeys.event(eventId) });
    },
  });
}

export function useUnassignParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, slotId }: { eventId: string; slotId: string }) =>
      api.roster.unassignParticipant(eventId, slotId),
    onSuccess: (updatedEvent, { eventId }) => {
      // Update the specific event
      queryClient.setQueryData(eventsQueryKeys.detail(eventId), updatedEvent);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: participantsQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: locksQueryKeys.event(eventId) });
    },
  });
}

export function useLockParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, request }: { eventId: string; request: CreateDraftLockRequest }) =>
      api.locks.lockParticipant(eventId, request),
    onSuccess: (_, { eventId }) => {
      // Invalidate locks query to show new lock
      queryClient.invalidateQueries({ queryKey: locksQueryKeys.event(eventId) });
    },
  });
}

export function useReleaseLockMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, participantType, participantId }: { 
      eventId: string; 
      participantType: ParticipantType; 
      participantId: string 
    }) =>
      api.locks.releaseLock(eventId, participantType, participantId),
    onSuccess: (_, { eventId }) => {
      // Invalidate locks query to remove released lock
      queryClient.invalidateQueries({ queryKey: locksQueryKeys.event(eventId) });
    },
  });
}