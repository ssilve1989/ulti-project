import type { CommunityStats, SignupDisplayData } from '@ulti-project/shared';

// Development mode detection and mock data toggle
const isDevelopment = import.meta.env.DEV;
const MOCK_DATA_KEY = 'ulti-project-use-mock-data';

// Lazy-loaded mock data - only imported in development
let mockDataModule: {
  mockEncounters: any[];
  mockSignups: SignupDisplayData[];
} | null = null;

async function getMockData() {
  if (!isDevelopment) {
    throw new Error('Mock data is only available in development mode');
  }

  if (!mockDataModule) {
    // Dynamic import - will be tree-shaken in production
    mockDataModule = await import('./mockData.js');
  }

  return mockDataModule;
}

// Get initial mock data preference from localStorage or default to true
const getInitialMockDataSetting = (): boolean => {
  if (typeof window === 'undefined') {
    return isDevelopment; // Only use mock data in dev on server
  }
  const stored = localStorage.getItem(MOCK_DATA_KEY);
  return stored !== null ? stored === 'true' : isDevelopment;
};

let USE_MOCK_DATA = getInitialMockDataSetting();

// Development-only functions to control mock data mode
export const devControls = isDevelopment
  ? {
      useMockData: (): boolean => USE_MOCK_DATA,
      setMockData: (enabled: boolean): void => {
        USE_MOCK_DATA = enabled;
        if (typeof window !== 'undefined') {
          localStorage.setItem(MOCK_DATA_KEY, enabled.toString());
          // Dispatch custom event to notify components
          window.dispatchEvent(
            new CustomEvent('mock-data-changed', {
              detail: { enabled },
            }),
          );
        }
      },
      toggleMockData: (): boolean => {
        const newValue = !USE_MOCK_DATA;
        if (devControls) {
          devControls.setMockData(newValue);
        }
        return newValue;
      },
    }
  : null;

// Make dev controls available globally in development
if (isDevelopment && typeof window !== 'undefined') {
  (window as any).__ultiDevControls = devControls;
}

// Use relative URL in development, absolute URL in production
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use relative URL to leverage the proxy
    return '';
  }
  // Server-side: use absolute URL for SSR
  return process.env.NODE_ENV === 'production'
    ? 'https://your-api-domain.com'
    : 'http://localhost:3000';
};

// SSE Event types matching the server
export interface SignupChangeEvent {
  type: 'added' | 'modified' | 'removed';
  doc: SignupDisplayData;
}

// Initial signups response (for SSR and initial load)
export interface SignupsResponse {
  signups: SignupDisplayData[];
  encounters: Array<{
    id: string;
    name: string;
    shortName: string;
  }>;
}

// SSE connection for real-time updates
export function createSignupsEventSource(): EventSource | null {
  if (typeof window === 'undefined') {
    return null; // SSE only works client-side
  }

  if (USE_MOCK_DATA) {
    // For mock data, we'll simulate SSE events
    return createMockEventSource();
  }

  const baseUrl = getBaseUrl();
  return new EventSource(`${baseUrl}/api/firestore/signups`);
}

// Get initial signups data by collecting from SSE stream
export async function getInitialSignups(): Promise<SignupsResponse> {
  if (USE_MOCK_DATA) {
    return getMockInitialSignups();
  }

  return new Promise((resolve, reject) => {
    const baseUrl = getBaseUrl();
    const eventSource = new EventSource(`${baseUrl}/api/signups`);
    const signups: SignupDisplayData[] = [];
    let hasReceivedData = false;

    const timeout = setTimeout(() => {
      eventSource.close();
      reject(new Error('Timeout waiting for initial data'));
    }, 10000); // 10 second timeout

    eventSource.onmessage = (event) => {
      try {
        const changeEvent: SignupChangeEvent = JSON.parse(event.data);

        if (changeEvent.type === 'added') {
          signups.push(changeEvent.doc);
          hasReceivedData = true;
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      clearTimeout(timeout);
      eventSource.close();

      if (hasReceivedData) {
        // If we got some data before the error, return what we have
        // TODO: Replace with actual encounters from API
        resolve({
          signups,
          encounters: [], // Will be populated from API in production
        });
      } else {
        reject(new Error('Failed to connect to signup stream'));
      }
    };

    // Wait a bit for initial data to load, then resolve
    setTimeout(() => {
      clearTimeout(timeout);
      eventSource.close();

      // TODO: Replace with actual encounters from API
      resolve({
        signups,
        encounters: [], // Will be populated from API in production
      });
    }, 2000); // Wait 2 seconds for initial data
  });
}

export async function getCommunityStats(): Promise<CommunityStats> {
  if (USE_MOCK_DATA) {
    return getMockCommunityStats();
  }

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/website/stats`);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    // In production builds, return placeholder data if API is unavailable
    console.error('Failed to fetch community stats:', error);
    return {
      totalSignups: 0,
      activeEncounters: 0,
      currentContent: "Future's Rewritten (FRU)",
      squads: [],
      progRequirements: {},
      socialLinks: {
        discord: 'https://discord.gg/sausfest',
        twitter: '#',
        twitch: '#',
        youtube: '#',
      },
    };
  }
}

// Mock implementations
function createMockEventSource(): EventSource {
  // Create a mock EventSource that simulates real-time updates
  const mockEventSource = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onopen: null as ((event: Event) => void) | null,
    readyState: 1, // OPEN
    url: '/mock/signups',
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
    close: () => {},
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') {
        mockEventSource.onmessage = listener as (event: MessageEvent) => void;
      }
    },
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as EventSource;

  // Simulate initial data load
  setTimeout(async () => {
    if (mockEventSource.onmessage) {
      const { mockSignups } = await getMockData();
      // Send all existing signups as 'added' events
      mockSignups.forEach((signup: SignupDisplayData, index: number) => {
        setTimeout(() => {
          const event = new MessageEvent('message', {
            data: JSON.stringify({
              type: 'added',
              doc: signup,
            } as SignupChangeEvent),
          });
          mockEventSource.onmessage?.(event);
        }, index * 10); // Stagger the events slightly
      });
    }
  }, 100);

  // Simulate occasional updates
  setInterval(async () => {
    if (mockEventSource.onmessage && Math.random() < 0.1) {
      const { mockSignups } = await getMockData();
      // 10% chance every 5 seconds to simulate an update
      const randomSignup =
        mockSignups[Math.floor(Math.random() * mockSignups.length)];
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'modified',
          doc: {
            ...randomSignup,
            lastUpdated: new Date(),
          },
        } as SignupChangeEvent),
      });
      mockEventSource.onmessage(event);
    }
  }, 5000);

  return mockEventSource;
}

async function getMockInitialSignups(): Promise<SignupsResponse> {
  const { mockSignups, mockEncounters } = await getMockData();

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    signups: mockSignups,
    encounters: mockEncounters,
  };
}

async function getMockCommunityStats(): Promise<CommunityStats> {
  const { mockSignups, mockEncounters } = await getMockData();

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
