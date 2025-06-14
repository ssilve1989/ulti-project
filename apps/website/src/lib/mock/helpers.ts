import type {
  HelperAbsence,
  HelperData,
  HelperWeeklyAvailability,
  Job,
  Role,
} from '@ulti-project/shared';
import { MOCK_CONFIG, delay } from './config.js';

// Mock helper data
const mockHelpers: HelperData[] = [
  {
    id: 'helper-1',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    discordId: '123456789012345678',
    name: 'TankMaster',
    availableJobs: [
      { job: 'Paladin' as Job, role: 'Tank' as Role },
      { job: 'Warrior' as Job, role: 'Tank' as Role },
      { job: 'Dark Knight' as Job, role: 'Tank' as Role },
    ],
    weeklyAvailability: [
      // Monday - Wednesday evenings (restrictive schedule)
      { dayOfWeek: 1, timeRanges: [{ start: '19:00', end: '23:00' }] },
      { dayOfWeek: 2, timeRanges: [{ start: '19:00', end: '23:00' }] },
      { dayOfWeek: 3, timeRanges: [{ start: '19:00', end: '23:00' }] },
      // Weekend afternoons and evenings
      {
        dayOfWeek: 6,
        timeRanges: [
          { start: '14:00', end: '18:00' },
          { start: '20:00', end: '24:00' },
        ],
      },
      { dayOfWeek: 0, timeRanges: [{ start: '12:00', end: '18:00' }] },
    ],
  } as HelperData,
  {
    id: 'helper-2',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    discordId: '234567890123456789',
    name: 'HealBot',
    availableJobs: [
      { job: 'White Mage' as Job, role: 'Healer' as Role },
      { job: 'Scholar' as Job, role: 'Healer' as Role },
      { job: 'Astrologian' as Job, role: 'Healer' as Role },
      { job: 'Sage' as Job, role: 'Healer' as Role },
    ],
    // No weeklyAvailability - defaults to always available
  } as HelperData,
  {
    id: 'helper-3',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    discordId: '345678901234567890',
    name: 'DPSGod',
    availableJobs: [
      { job: 'Black Mage' as Job, role: 'DPS' as Role },
      { job: 'Summoner' as Job, role: 'DPS' as Role },
      { job: 'Red Mage' as Job, role: 'DPS' as Role },
      { job: 'Dragoon' as Job, role: 'DPS' as Role },
    ],
    weeklyAvailability: [
      // Very limited schedule - only Tuesday and Thursday evenings
      { dayOfWeek: 2, timeRanges: [{ start: '20:00', end: '24:00' }] },
      { dayOfWeek: 4, timeRanges: [{ start: '20:00', end: '24:00' }] },
    ],
  } as HelperData,
  {
    id: 'helper-4',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    discordId: '456789012345678901',
    name: 'FlexPlayer',
    availableJobs: [
      { job: 'Gunbreaker' as Job, role: 'Tank' as Role },
      { job: 'Sage' as Job, role: 'Healer' as Role },
      { job: 'Reaper' as Job, role: 'DPS' as Role },
      { job: 'Dancer' as Job, role: 'DPS' as Role },
    ],
    // No weeklyAvailability - defaults to always available (very flexible player)
  } as HelperData,
  {
    id: 'helper-5',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    discordId: '567890123456789012',
    name: 'RangedExpert',
    availableJobs: [
      { job: 'Bard' as Job, role: 'DPS' as Role },
      { job: 'Machinist' as Job, role: 'DPS' as Role },
      { job: 'Dancer' as Job, role: 'DPS' as Role },
    ],
    weeklyAvailability: [
      // Weekend only availability
      { dayOfWeek: 6, timeRanges: [{ start: '15:00', end: '19:00' }] },
      { dayOfWeek: 0, timeRanges: [{ start: '15:00', end: '19:00' }] },
    ],
  } as HelperData,
  {
    id: 'helper-6',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    discordId: '678901234567890123',
    name: 'MeleeMain',
    availableJobs: [
      { job: 'Monk' as Job, role: 'DPS' as Role },
      { job: 'Dragoon' as Job, role: 'DPS' as Role },
      { job: 'Ninja' as Job, role: 'DPS' as Role },
      { job: 'Samurai' as Job, role: 'DPS' as Role },
      { job: 'Reaper' as Job, role: 'DPS' as Role },
    ],
    // No weeklyAvailability - defaults to always available
  } as HelperData,
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
  // Filter helpers by current guild
  return mockHelpers.filter(
    (h: any) => h.guildId === MOCK_CONFIG.guild.defaultGuildId,
  );
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

  // Check against absences first
  const conflicts = mockAbsences.filter(
    (absence) =>
      absence.helperId === helperId &&
      !(endTime <= absence.startDate || startTime >= absence.endDate),
  );

  if (conflicts.length > 0) return false;

  // Check against weekly availability if it exists
  if (helper.weeklyAvailability && helper.weeklyAvailability.length > 0) {
    return isWithinWeeklyAvailability(
      startTime,
      endTime,
      helper.weeklyAvailability,
    );
  }

  // If no weekly availability is set, assume available (legacy behavior)
  return true;
}

// New function to check if event time falls within weekly availability
export async function isHelperAvailableForEvent(
  helperId: string,
  eventStart: Date,
  eventEnd: Date,
): Promise<{
  available: boolean;
  reason?: 'absent' | 'outside_schedule' | 'available';
}> {
  await delay(MOCK_CONFIG.delays.fast);

  const helper = mockHelpers.find((h) => h.id === helperId);
  if (!helper) {
    return { available: false, reason: 'outside_schedule' };
  }

  // Check against absences first
  const hasAbsence = mockAbsences.some(
    (absence) =>
      absence.helperId === helperId &&
      !(eventEnd <= absence.startDate || eventStart >= absence.endDate),
  );

  if (hasAbsence) {
    return { available: false, reason: 'absent' };
  }

  // Check weekly availability
  if (helper.weeklyAvailability && helper.weeklyAvailability.length > 0) {
    const withinSchedule = isWithinWeeklyAvailability(
      eventStart,
      eventEnd,
      helper.weeklyAvailability,
    );

    return {
      available: withinSchedule,
      reason: withinSchedule ? 'available' : 'outside_schedule',
    };
  }

  // If no weekly availability set, assume available
  return { available: true, reason: 'available' };
}

// Helper function to check if time range falls within weekly availability
function isWithinWeeklyAvailability(
  startTime: Date,
  endTime: Date,
  weeklyAvailability: HelperWeeklyAvailability[],
): boolean {
  const dayOfWeek = startTime.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Find availability for this day of week
  const dayAvailability = weeklyAvailability.find(
    (avail) => avail.dayOfWeek === dayOfWeek,
  );

  if (!dayAvailability || dayAvailability.timeRanges.length === 0) {
    return false;
  }

  // Convert event times to minutes since midnight
  const eventStartMinutes = startTime.getHours() * 60 + startTime.getMinutes();
  const eventEndMinutes = endTime.getHours() * 60 + endTime.getMinutes();

  // Check if event falls within any of the available time ranges for this day
  return dayAvailability.timeRanges.some((range) => {
    const rangeStartMinutes = timeStringToMinutes(range.start);
    const rangeEndMinutes = timeStringToMinutes(range.end);

    // Event must start and end within the available time range
    return (
      eventStartMinutes >= rangeStartMinutes &&
      eventEndMinutes <= rangeEndMinutes
    );
  });
}

// Helper function to convert "HH:MM" to minutes since midnight
function timeStringToMinutes(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
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
