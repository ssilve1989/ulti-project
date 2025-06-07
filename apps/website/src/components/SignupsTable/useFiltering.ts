import type { SignupDisplayData } from '@ulti-project/shared/types';
import { useMemo, useState } from 'react';

export interface SignupFilters {
  encounter: string;
  partyType: string;
  role: string;
  search: string;
}

export function useFiltering(signups: SignupDisplayData[]) {
  const [filters, setFilters] = useState<SignupFilters>({
    encounter: '',
    partyType: '',
    role: '',
    search: '',
  });

  const filteredSignups = useMemo(() => {
    return signups.filter((signup) => {
      if (filters.encounter && signup.encounter !== filters.encounter)
        return false;
      if (filters.partyType && signup.partyStatus !== filters.partyType)
        return false;
      if (filters.role && signup.role !== filters.role) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesName = signup.characterName
          .toLowerCase()
          .includes(searchLower);
        const matchesWorld = signup.world.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesWorld) return false;
      }
      return true;
    });
  }, [signups, filters]);

  return {
    filters,
    setFilters,
    filteredSignups,
  };
}
