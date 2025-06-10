import type { HelperAbsence, HelperData } from '@ulti-project/shared';
import { MOCK_CONFIG, delay } from './config.js';

// Mock helper data
const mockHelpers: HelperData[] = [
  {
    id: 'helper-1',
    discordId: '123456789012345678',
    name: 'TankMaster',
    availableJobs: [
      { job: 'Paladin', role: 'Tank' },
      { job: 'Warrior', role: 'Tank' },
      { job: 'Dark Knight', role: 'Tank' },
    ],
  },
  {
    id: 'helper-2',
    discordId: '234567890123456789',
    name: 'HealBot',
    availableJobs: [
      { job: 'White Mage', role: 'Healer' },
      { job: 'Scholar', role: 'Healer' },
      { job: 'Astrologian', role: 'Healer' },
      { job: 'Sage', role: 'Healer' },
    ],
  },
  {
    id: 'helper-3',
    discordId: '345678901234567890',
    name: 'DPSGod',
    availableJobs: [
      { job: 'Black Mage', role: 'DPS' },
      { job: 'Summoner', role: 'DPS' },
      { job: 'Red Mage', role: 'DPS' },
      { job: 'Dragoon', role: 'DPS' },
    ],
  },
  {
    id: 'helper-4',
    discordId: '456789012345678901',
    name: 'FlexPlayer',
    availableJobs: [
      { job: 'Gunbreaker', role: 'Tank' },
      { job: 'Sage', role: 'Healer' },
      { job: 'Reaper', role: 'DPS' },
      { job: 'Dancer', role: 'DPS' },
    ],
  },
  {
    id: 'helper-5',
    discordId: '567890123456789012',
    name: 'RangedExpert',
    availableJobs: [
      { job: 'Bard', role: 'DPS' },
      { job: 'Machinist', role: 'DPS' },
      { job: 'Dancer', role: 'DPS' },
    ],
  },
  {
    id: 'helper-6',
    discordId: '678901234567890123',
    name: 'MeleeMain',
    availableJobs: [
      { job: 'Monk', role: 'DPS' },
      { job: 'Dragoon', role: 'DPS' },
      { job: 'Ninja', role: 'DPS' },
      { job: 'Samurai', role: 'DPS' },
      { job: 'Reaper', role: 'DPS' },
    ],
  },
];

const mockAbsences: HelperAbsence[] = [
  {
    id: 'absence-1',
    helperId: 'helper-3',
    startDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    reason: 'Vacation',
  },
  {
    id: 'absence-2',
    helperId: 'helper-6',
    startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    reason: 'Work trip',
  },
];

// In-memory state for SSE simulation
const helperConnections: Set<(event: MessageEvent) => void> = new Set();
const absenceConnections: Set<(event: MessageEvent) => void> = new Set();

// API Functions
export async function getHelpers(): Promise<HelperData[]> {
  await delay(MOCK_CONFIG.delays.medium);
  return [...mockHelpers];
}

export async function getHelper(id: string): Promise<HelperData | null> {
  await delay(MOCK_CONFIG.delays.fast);
  return mockHelpers.find((h) => h.id === id) || null;
}

export async function getHelperAbsences(): Promise<HelperAbsence[]> {
  await delay(MOCK_CONFIG.delays.medium);
  return [...mockAbsences];
}

export async function getHelperAbsencesForHelper(
  helperId: string,
): Promise<HelperAbsence[]> {
  await delay(MOCK_CONFIG.delays.fast);
  return mockAbsences.filter((a) => a.helperId === helperId);
}

// Check if helper is available at a specific time
export async function isHelperAvailable(
  helperId: string,
  startTime: Date,
  endTime: Date,
): Promise<boolean> {
  await delay(MOCK_CONFIG.delays.fast);

  const helper = mockHelpers.find((h) => h.id === helperId);
  if (!helper) return false;

  // Check against absences
  const conflicts = mockAbsences.filter(
    (absence) =>
      absence.helperId === helperId &&
      !(endTime <= absence.startDate || startTime >= absence.endDate),
  );

  return conflicts.length === 0;
}

// SSE Stream simulation
export function createHelpersEventSource(): EventSource {
  const mockEventSource = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onopen: null as ((event: Event) => void) | null,
    readyState: 1, // OPEN
    url: '/mock/helpers',
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
    close: () => {
      if (mockEventSource.onmessage) {
        helperConnections.delete(mockEventSource.onmessage);
      }
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') {
        mockEventSource.onmessage = listener as (event: MessageEvent) => void;
        if (mockEventSource.onmessage) {
          helperConnections.add(mockEventSource.onmessage);
        }
      }
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'message' && mockEventSource.onmessage) {
        helperConnections.delete(mockEventSource.onmessage);
      }
    },
    dispatchEvent: () => true,
  } as unknown as EventSource;

  // Send initial data
  setTimeout(() => {
    if (mockEventSource.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'helpers_initial',
          data: mockHelpers,
          timestamp: new Date(),
        }),
      });
      mockEventSource.onmessage(event);
    }
  }, 100);

  return mockEventSource;
}

// SSE Stream for helper absences
export function createHelperAbsencesEventSource(): EventSource {
  const mockEventSource = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onopen: null as ((event: Event) => void) | null,
    readyState: 1, // OPEN
    url: '/mock/helper-absences',
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
    close: () => {
      if (mockEventSource.onmessage) {
        absenceConnections.delete(mockEventSource.onmessage);
      }
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') {
        mockEventSource.onmessage = listener as (event: MessageEvent) => void;
        if (mockEventSource.onmessage) {
          absenceConnections.add(mockEventSource.onmessage);
        }
      }
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'message' && mockEventSource.onmessage) {
        absenceConnections.delete(mockEventSource.onmessage);
      }
    },
    dispatchEvent: () => true,
  } as unknown as EventSource;

  // Send initial data
  setTimeout(() => {
    if (mockEventSource.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'absences_initial',
          data: mockAbsences,
          timestamp: new Date(),
        }),
      });
      mockEventSource.onmessage(event);
    }
  }, 100);

  return mockEventSource;
}

// Utility functions for development
export function getHelperById(id: string): HelperData | undefined {
  return mockHelpers.find((h) => h.id === id);
}
