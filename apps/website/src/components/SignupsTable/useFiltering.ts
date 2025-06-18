import type { SignupDisplayData } from '@ulti-project/shared';
import { useMemo, useState } from 'react';

export interface SignupFilters {
  encounter: string;
  partyType: string;
  search: string;
}

export function useFiltering(signups: SignupDisplayData[]) {
  const [filters, setFilters] = useState<SignupFilters>({
    encounter: '',
    partyType: '',
    search: '',
  });

  const filteredSignups = useMemo(() => {
    return signups.filter((signup) => {
      if (filters.encounter && signup.encounter !== filters.encounter)
        return false;
      if (filters.partyType && signup.partyStatus !== filters.partyType)
        return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesName = signup.character
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
