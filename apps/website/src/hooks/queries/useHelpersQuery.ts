import { useQuery } from '@tanstack/react-query';
import type { Encounter, ParticipantType, Role, Job } from '@ulti-project/shared';
import { api } from '../../lib/api/client.js';

export const helpersQueryKeys = {
  all: ['helpers'] as const,
  lists: () => [...helpersQueryKeys.all, 'list'] as const,
  details: () => [...helpersQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...helpersQueryKeys.details(), id] as const,
};

export const participantsQueryKeys = {
  all: ['participants'] as const,
  lists: () => [...participantsQueryKeys.all, 'list'] as const,
  list: (filters?: { encounter?: Encounter; type?: ParticipantType; role?: Role; job?: Job }) => 
    [...participantsQueryKeys.lists(), filters] as const,
};

export const locksQueryKeys = {
  all: ['locks'] as const,
  lists: () => [...locksQueryKeys.all, 'list'] as const,
  event: (eventId: string) => [...locksQueryKeys.lists(), eventId] as const,
};

export function useHelpersQuery() {
  return useQuery({
    queryKey: helpersQueryKeys.lists(),
    queryFn: () => api.helpers.getHelpers(),
    staleTime: 5 * 60 * 1000, // 5 minutes - helpers don't change often
  });
}

export function useHelperQuery(helperId: string) {
  return useQuery({
    queryKey: helpersQueryKeys.detail(helperId),
    queryFn: () => api.helpers.getHelper(helperId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!helperId,
  });
}

export function useParticipantsQuery(filters?: { encounter?: Encounter; type?: ParticipantType; role?: Role; job?: Job }) {
  return useQuery({
    queryKey: participantsQueryKeys.list(filters),
    queryFn: () => api.roster.getParticipants(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes - participants might change more frequently
  });
}

export function useActiveLocksQuery(eventId: string) {
  return useQuery({
    queryKey: locksQueryKeys.event(eventId),
    queryFn: () => api.locks.getActiveLocks(eventId),
    staleTime: 30 * 1000, // 30 seconds - locks change frequently
    enabled: !!eventId,
  });
}