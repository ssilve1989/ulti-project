import {
  Encounter,
  EventStatus,
  Job,
  ParticipantType,
  Role,
} from '@ulti-project/shared';
import type {
  CreateEventRequest,
  EventFilters,
  EventRoster,
  PartySlot,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';
import { compareAsc, isAfter } from 'date-fns';
import { MOCK_CONFIG, delay } from './config.js';
import { getHelperById } from './helpers.js';

// In-memory events storage
const mockEvents = new Map<string, ScheduledEvent & { guildId: string }>();
let eventIdCounter = 1;

// Storage key for sessionStorage
const STORAGE_KEY = 'ulti-project-mock-events';
const COUNTER_KEY = 'ulti-project-event-counter';

// SSE connections for event updates
const eventConnections = new Map<string, Set<(event: MessageEvent) => void>>();

// Helper function to create empty roster
function createEmptyRoster(): EventRoster {
  const party: PartySlot[] = [];

  // Create 8 slots (2 tanks, 2 healers, 4 DPS)
  for (let i = 0; i < 8; i++) {
    const slot: PartySlot = {
      id: `slot-${i + 1}`,
      role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
      isHelperSlot: i % 2 === 0, // Alternate helper/progger slots
    };
    party.push(slot);
  }

  return {
    party,
    totalSlots: 8,
    filledSlots: 0,
  };
}

// Helper function to create partially filled roster for testing
function createPartiallyFilledRoster(): EventRoster {
  const aetherDefender = getHelperById('helper-1');
  const lunarSanctuary = getHelperById('helper-2');

  const slots: PartySlot[] = [
    // Tank slots
    {
      id: 'slot-1',
      role: Role.Tank,
      isHelperSlot: true,
      assignedParticipant: aetherDefender
        ? {
            ...aetherDefender,
            type: ParticipantType.Helper,
            job: Job.Paladin,
            isConfirmed: false,
          }
        : undefined,
    },
    {
      id: 'slot-2',
      role: Role.Tank,
      isHelperSlot: false,
      assignedParticipant: {
        type: ParticipantType.Progger,
        id: 'progger-7',
        discordId: '777777777777777777',
        name: 'Storm Breaker',
        job: Job.Warrior,
        encounter: Encounter.UWU,
        isConfirmed: false,
      },
    },
    // Healer slots
    {
      id: 'slot-3',
      role: Role.Healer,
      isHelperSlot: true,
      assignedParticipant: lunarSanctuary
        ? {
            ...lunarSanctuary,
            type: ParticipantType.Helper,
            job: Job.WhiteMage,
            isConfirmed: false,
          }
        : undefined,
    },
    {
      id: 'slot-4',
      role: Role.Healer,
      isHelperSlot: false,
      assignedParticipant: {
        type: ParticipantType.Progger,
        id: 'progger-healer-1',
        discordId: '789123456',
        name: 'LearningHealer',
        job: Job.Scholar,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    // DPS slots (4 empty)
    { id: 'slot-5', role: Role.DPS, isHelperSlot: true },
    { id: 'slot-6', role: Role.DPS, isHelperSlot: false },
    { id: 'slot-7', role: Role.DPS, isHelperSlot: true },
    { id: 'slot-8', role: Role.DPS, isHelperSlot: false },
  ];

  return {
    party: slots,
    totalSlots: 8,
    filledSlots: 4,
  };
}

// Helper function to create fully filled roster for testing
function createFullyFilledRoster(): EventRoster {
  const slots: PartySlot[] = [
    // Tank slots
    {
      id: 'slot-1',
      role: Role.Tank,
      isHelperSlot: true,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-1',
        discordId: '123456789012345678',
        name: 'TankMaster',
        job: Job.Paladin,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    {
      id: 'slot-2',
      role: Role.Tank,
      isHelperSlot: false,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-7',
        discordId: '789012345678901234',
        name: 'MainTank',
        job: Job.Gunbreaker,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    // Healer slots
    {
      id: 'slot-3',
      role: Role.Healer,
      isHelperSlot: true,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-2',
        discordId: '234567890123456789',
        name: 'HealBot',
        job: Job.WhiteMage,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    {
      id: 'slot-4',
      role: Role.Healer,
      isHelperSlot: false,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-8',
        discordId: '890123456789012345',
        name: 'HealerPro',
        job: Job.Astrologian,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    // DPS slots
    {
      id: 'slot-5',
      role: Role.DPS,
      isHelperSlot: true,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-3',
        discordId: '345678901234567890',
        name: 'DPSGod',
        job: Job.BlackMage,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    {
      id: 'slot-6',
      role: Role.DPS,
      isHelperSlot: false,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-5',
        discordId: '567890123456789012',
        name: 'RangedExpert',
        job: Job.Bard,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    {
      id: 'slot-7',
      role: Role.DPS,
      isHelperSlot: true,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-6',
        discordId: '678901234567890123',
        name: 'MeleeMain',
        job: Job.Ninja,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
    {
      id: 'slot-8',
      role: Role.DPS,
      isHelperSlot: false,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-12',
        discordId: '234561098765432109',
        name: 'UtilityDPS',
        job: Job.Reaper,
        encounter: Encounter.FRU,
        isConfirmed: true,
      },
    },
  ];

  return {
    party: slots,
    totalSlots: 8,
    filledSlots: 8,
  };
}

// Initialize with some sample events
const sampleEvents: (ScheduledEvent & { guildId: string })[] = [
  {
    id: 'event-1',
    name: 'FRU Prog Session',
    encounter: Encounter.FRU,
    scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    duration: 120, // 2 hours
    teamLeaderId: 'leader-1',
    teamLeaderName: 'TeamAlpha',
    status: EventStatus.Draft,
    roster: createPartiallyFilledRoster(), // Partially filled for testing
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    lastModified: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    version: 1,
    guildId: MOCK_CONFIG.guild.defaultGuildId,
  },
  {
    id: 'event-2',
    name: 'TOP Clear Run',
    encounter: Encounter.TOP,
    scheduledTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
    duration: 180, // 3 hours
    teamLeaderId: 'leader-2',
    teamLeaderName: 'TeamBeta',
    status: EventStatus.Published,
    roster: createEmptyRoster(), // Keep this one empty for testing empty state
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    lastModified: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
    version: 3,
    guildId: MOCK_CONFIG.guild.defaultGuildId,
  },
  {
    id: 'event-3',
    name: 'DSR Full Clear',
    encounter: Encounter.DSR,
    scheduledTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    duration: 240, // 4 hours
    teamLeaderId: 'leader-3',
    teamLeaderName: 'TeamGamma',
    status: EventStatus.Draft,
    roster: createFullyFilledRoster(), // Full roster ready to publish
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    lastModified: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    version: 2,
    guildId: MOCK_CONFIG.guild.defaultGuildId,
  },
];

// Initialize data
let isInitialized = false;

function initializeEvents() {
  if (isInitialized) return;
  isInitialized = true;

  // Try to load from storage first
  loadEventsFromStorage();

  // Only initialize sample events if no events were loaded from storage
  if (mockEvents.size === 0) {
    console.log('No events in storage, initializing with sample events');
    for (const event of sampleEvents) {
      mockEvents.set(event.id, event);
    }
    saveEventsToStorage();
  } else {
    console.log(`Using ${mockEvents.size} events from storage`);
  }
}

// Initialize on module load
initializeEvents();

// Re-initialize on client side to ensure we have the latest from sessionStorage
if (typeof window !== 'undefined') {
  // Use a small delay to ensure DOM is ready
  setTimeout(() => {
    console.log('Client-side re-initialization...');
    isInitialized = false; // Allow re-initialization
    initializeEvents();
  }, 0);
}

// Load events from sessionStorage on initialization
function loadEventsFromStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    const storedEvents = sessionStorage.getItem(STORAGE_KEY);
    const storedCounter = sessionStorage.getItem(COUNTER_KEY);

    if (storedEvents) {
      const parsed = JSON.parse(storedEvents);
      mockEvents.clear();

      for (const [id, event] of Object.entries(parsed)) {
        // Convert date strings back to Date objects
        const eventData = event as any;
        const restoredEvent: ScheduledEvent & { guildId: string } = {
          id: eventData.id,
          name: eventData.name,
          encounter: eventData.encounter,
          scheduledTime: new Date(eventData.scheduledTime).toISOString(),
          duration: eventData.duration,
          teamLeaderId: eventData.teamLeaderId,
          teamLeaderName: eventData.teamLeaderName,
          status: eventData.status,
          roster: {
            party: eventData.roster.party.map((slot: any) => ({
              ...slot,
              draftedAt: slot.draftedAt ? new Date(slot.draftedAt) : undefined,
            })),
            totalSlots: eventData.roster.totalSlots,
            filledSlots: eventData.roster.filledSlots,
          },
          createdAt: new Date(eventData.createdAt).toISOString(),
          lastModified: new Date(eventData.lastModified).toISOString(),
          version: eventData.version,
          guildId: eventData.guildId || MOCK_CONFIG.guild.defaultGuildId, // Fallback for old data
        };
        mockEvents.set(id, restoredEvent);
      }
      console.log(`Loaded ${mockEvents.size} events from sessionStorage`);

      // Debug logging
      const event1 = mockEvents.get('event-1');
      if (event1) {
        console.log('Loaded event-1:', {
          id: event1.id,
          name: event1.name,
          filledSlots: event1.roster.filledSlots,
          firstSlot: event1.roster.party[0],
          hasAssignedParticipants: event1.roster.party.some(
            (slot) => slot.assignedParticipant,
          ),
        });
      }
    }

    if (storedCounter) {
      eventIdCounter = Number.parseInt(storedCounter, 10);
    }
  } catch (error) {
    console.error('Failed to load events from sessionStorage:', error);
  }
}

// Save events to sessionStorage
function saveEventsToStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    const eventsObj: Record<string, ScheduledEvent> = {};
    for (const [id, event] of mockEvents.entries()) {
      eventsObj[id] = event;
    }

    const serialized = JSON.stringify(eventsObj);
    sessionStorage.setItem(STORAGE_KEY, serialized);
    sessionStorage.setItem(COUNTER_KEY, eventIdCounter.toString());

    // Debug logging
    console.log('Saved events to sessionStorage:', {
      eventCount: Object.keys(eventsObj).length,
      sampleEvent: eventsObj['event-1'],
      dataSize: serialized.length,
    });
  } catch (error) {
    console.error('Failed to save events to sessionStorage:', error);
  }
}

// Broadcast event updates
function broadcastEventUpdate(
  eventId: string,
  event: ScheduledEvent,
  changes: Partial<ScheduledEvent>,
): void {
  const connections = eventConnections.get(eventId);
  if (!connections) return;

  const message = new MessageEvent('message', {
    data: JSON.stringify({
      type: 'event_updated',
      data: { eventId, event, changes },
      timestamp: new Date(),
    }),
  });

  for (const callback of connections) {
    callback(message);
  }
}

// API Functions
export async function createEvent(
  request: CreateEventRequest,
): Promise<ScheduledEvent> {
  await delay(MOCK_CONFIG.delays.slow);

  const now = new Date().toISOString();

  const event: ScheduledEvent & { guildId: string } = {
    id: `event-${eventIdCounter++}`,
    name: request.name,
    encounter: request.encounter,
    scheduledTime: request.scheduledTime,
    duration: request.duration,
    teamLeaderId: request.teamLeaderId,
    teamLeaderName: `Leader-${request.teamLeaderId}`,
    status: EventStatus.Draft,
    roster: createEmptyRoster(),
    createdAt: now,
    lastModified: now,
    version: 1,
    guildId: MOCK_CONFIG.guild.defaultGuildId,
  };

  mockEvents.set(event.id, event);
  saveEventsToStorage();

  // Return the event without guildId to match the API contract
  const { guildId, ...publicEvent } = event;
  return publicEvent;
}

export async function getEvent(id: string): Promise<ScheduledEvent | null> {
  await delay(MOCK_CONFIG.delays.fast);
  const event = mockEvents.get(id);
  if (!event) return null;

  // Return the event without guildId to match the API contract
  const { guildId, ...publicEvent } = event;
  return publicEvent;
}

export async function getEvents(
  filters?: EventFilters,
): Promise<ScheduledEvent[]> {
  await delay(MOCK_CONFIG.delays.medium);

  let events = Array.from(mockEvents.values());

  // Always filter by current guild
  events = events.filter(
    (e: any) => e.guildId === MOCK_CONFIG.guild.defaultGuildId,
  );

  if (filters?.teamLeaderId) {
    events = events.filter((e) => e.teamLeaderId === filters.teamLeaderId);
  }

  if (filters?.status) {
    events = events.filter((e) => e.status === filters.status);
  }

  if (filters?.encounter) {
    events = events.filter((e) => e.encounter === filters.encounter);
  }

  if (filters?.dateFrom) {
    events = events.filter((e) => e.scheduledTime >= filters.dateFrom!);
  }

  if (filters?.dateTo) {
    events = events.filter((e) => e.scheduledTime <= filters.dateTo!);
  }

  // Sort by scheduled time
  events.sort(
    (a, b) =>
      new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime(),
  );

  // Return events without guildId to match the API contract
  return events.map(({ guildId, ...publicEvent }) => publicEvent);
}

export async function updateEvent(
  id: string,
  updates: UpdateEventRequest,
): Promise<ScheduledEvent> {
  await delay(MOCK_CONFIG.delays.medium);

  const event = mockEvents.get(id);
  if (!event) {
    throw new Error('Event not found');
  }

  if (event.status === 'in-progress') {
    throw new Error('Cannot modify events that are in progress');
  }

  const updatedEvent: ScheduledEvent & { guildId: string } = {
    ...event,
    ...updates,
    lastModified: new Date().toISOString(),
    version: event.version + 1,
  };

  mockEvents.set(id, updatedEvent);
  saveEventsToStorage();

  // Broadcast update
  const { guildId, ...publicEvent } = updatedEvent;
  broadcastEventUpdate(id, publicEvent, updates);

  return publicEvent;
}

export async function deleteEvent(
  id: string,
  teamLeaderId: string,
): Promise<void> {
  await delay(MOCK_CONFIG.delays.medium);

  const event = mockEvents.get(id);
  if (!event) {
    throw new Error('Event not found');
  }

  // Authentication should handle access control at the route level
  // No need to validate team leader here

  if (event.status === 'in-progress') {
    throw new Error('Cannot delete events that are in progress');
  }

  mockEvents.delete(id);
  saveEventsToStorage();
}

// SSE Stream for event updates
export function createEventEventSource(eventId: string): EventSource {
  const mockEventSource = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onopen: null as ((event: Event) => void) | null,
    readyState: 1, // OPEN
    url: `/mock/events/${eventId}/stream`,
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
    close: () => {
      const connections = eventConnections.get(eventId);
      if (connections && mockEventSource.onmessage) {
        connections.delete(mockEventSource.onmessage);
        if (connections.size === 0) {
          eventConnections.delete(eventId);
        }
      }
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') {
        mockEventSource.onmessage = listener as (event: MessageEvent) => void;
        if (mockEventSource.onmessage) {
          if (!eventConnections.has(eventId)) {
            eventConnections.set(eventId, new Set());
          }
          eventConnections.get(eventId)!.add(mockEventSource.onmessage);
        }
      }
    },
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as EventSource;

  // Send initial event data
  setTimeout(async () => {
    if (mockEventSource.onmessage) {
      const event = await getEvent(eventId);
      if (event) {
        const message = new MessageEvent('message', {
          data: JSON.stringify({
            type: 'initial_event',
            data: { eventId, event },
            timestamp: new Date(),
          }),
        });
        mockEventSource.onmessage(message);
      }
    }
  }, 100);

  return mockEventSource;
}

// Utility functions
export function getEventsByTeamLeader(teamLeaderId: string): ScheduledEvent[] {
  return Array.from(mockEvents.values()).filter(
    (event) => event.teamLeaderId === teamLeaderId,
  );
}

export function getEventsByStatus(
  status: ScheduledEvent['status'],
): ScheduledEvent[] {
  return Array.from(mockEvents.values()).filter(
    (event) => event.status === status,
  );
}

export function getUpcomingEvents(limit = 10): ScheduledEvent[] {
  const now = new Date();
  return Array.from(mockEvents.values())
    .filter((event) => isAfter(new Date(event.scheduledTime), now))
    .sort((a, b) =>
      compareAsc(new Date(a.scheduledTime), new Date(b.scheduledTime)),
    )
    .slice(0, limit);
}
