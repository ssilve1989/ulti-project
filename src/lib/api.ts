import { mockEncounters, mockSignups } from './mockData.js';
import type {
  CommunityStats,
  SignupFilters,
  SignupsResponse,
} from './types.js';

const USE_MOCK_DATA = true; // Always use mock data for now

export async function getSignups(
  filters: SignupFilters = {},
): Promise<SignupsResponse> {
  if (USE_MOCK_DATA) {
    return getMockSignups(filters);
  }

  // Real API implementation (for future use)
  const baseUrl = 'http://localhost:3000';
  const params = new URLSearchParams(filters as any);
  const response = await fetch(`${baseUrl}/api/website/signups?${params}`);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

export async function getCommunityStats(): Promise<CommunityStats> {
  if (USE_MOCK_DATA) {
    return getMockCommunityStats();
  }

  const baseUrl = 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/website/stats`);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

// Mock implementations
async function getMockSignups(
  filters: SignupFilters = {},
): Promise<SignupsResponse> {
  // Simulate API delay for realistic experience
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Single-pass filtering for efficiency
  const filteredSignups = mockSignups.filter((signup) => {
    // Early returns for better performance
    if (filters.encounter && signup.encounter !== filters.encounter) {
      return false;
    }

    if (filters.partyType && signup.partyType !== filters.partyType) {
      return false;
    }

    if (filters.role && signup.role !== filters.role) {
      return false;
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const characterMatch = signup.characterName
        .toLowerCase()
        .includes(searchLower);
      const worldMatch = signup.world.toLowerCase().includes(searchLower);

      if (!characterMatch && !worldMatch) {
        return false;
      }
    }

    return true;
  });

  return {
    signups: filteredSignups,
    total: filteredSignups.length,
    encounters: mockEncounters,
  };
}

async function getMockCommunityStats(): Promise<CommunityStats> {
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    totalSignups: mockSignups.length,
    activeEncounters: mockEncounters.length,
    currentContent: "Future's Rewritten (FRU)", // Matches current Carrd focus
    squads: [
      { name: 'Sex Gods 3000', status: 'active' },
      { name: 'Space Travelers', status: 'active' },
    ],
    progRequirements: {
      FRU: {
        prog: 'P2 Light Rampant',
        clear: 'P5 Fulgent Blade 1 (Exalines 1)',
      },
    },
    socialLinks: {
      discord: 'https://discord.gg/sausfest',
      twitter: '#',
      twitch: '#',
      youtube: '#',
    },
  };
}
