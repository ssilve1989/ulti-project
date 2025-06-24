import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client.js';

export const helpersQueryKeys = {
  all: ['helpers'] as const,
  lists: () => [...helpersQueryKeys.all, 'list'] as const,
  details: () => [...helpersQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...helpersQueryKeys.details(), id] as const,
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