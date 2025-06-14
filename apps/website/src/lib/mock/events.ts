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
import { MOCK_CONFIG, delay } from './config.js';

// In-memory events storage
const mockEvents = new Map<string, ScheduledEvent>();
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
  const slots: PartySlot[] = [
    // Tank slots
    {
      id: 'slot-1',
      role: Role.Tank,
      isHelperSlot: true,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-tank-1',
        discordId: '123456789',
        name: 'TankMaster',
        characterName: 'Tank Master',
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
        type: ParticipantType.Progger,
        id: 'progger-tank-1',
        discordId: '987654321',
        name: 'NewTank',
        characterName: 'New Tank',
        job: Job.Warrior,
        encounter: Encounter.FRU,
        isConfirmed: false,
      },
    },
    // Healer slots
    {
      id: 'slot-3',
      role: Role.Healer,
      isHelperSlot: true,
      assignedParticipant: {
        type: ParticipantType.Helper,
        id: 'helper-healer-1',
        discordId: '456789123',
        name: 'HealBot',
        characterName: 'Heal Bot',
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
        type: ParticipantType.Progger,
        id: 'progger-healer-1',
        discordId: '789123456',
        name: 'LearningHealer',
        characterName: 'Learning Healer',
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

// Initialize with some sample events
const sampleEvents: ScheduledEvent[] = [
  {
    id: 'event-1',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    name: 'FRU Prog Session',
    encounter: Encounter.FRU,
    scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    duration: 120, // 2 hours
    teamLeaderId: 'leader-1',
    teamLeaderName: 'TeamAlpha',
    status: EventStatus.Draft,
    roster: createPartiallyFilledRoster(), // Partially filled for testing
    createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    lastModified: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    version: 1,
  } as ScheduledEvent,
  {
    id: 'event-2',
    guildId: MOCK_CONFIG.guild.defaultGuildId,
    name: 'TOP Clear Run',
    encounter: Encounter.TOP,
    scheduledTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
    duration: 180, // 3 hours
    teamLeaderId: 'leader-2',
    teamLeaderName: 'TeamBeta',
    status: EventStatus.Published,
    roster: createEmptyRoster(), // Keep this one empty for testing empty state
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    lastModified: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
    version: 3,
  } as ScheduledEvent,
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
        const restoredEvent: ScheduledEvent = {
          id: eventData.id,
          name: eventData.name,
          encounter: eventData.encounter,
          scheduledTime: new Date(eventData.scheduledTime),
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
          createdAt: new Date(eventData.createdAt),
          lastModified: new Date(eventData.lastModified),
          version: eventData.version,
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

  const event: ScheduledEvent = {
    id: `event-${eventIdCounter++}`,
    guildId: request.guildId,
    name: request.name,
    encounter: request.encounter,
    scheduledTime: request.scheduledTime,
    duration: request.duration,
    teamLeaderId: request.teamLeaderId,
    teamLeaderName: `Leader-${request.teamLeaderId}`,
    status: EventStatus.Draft,
    roster: createEmptyRoster(),
    createdAt: new Date(),
    lastModified: new Date(),
    version: 1,
  } as ScheduledEvent;

  mockEvents.set(event.id, event);
  saveEventsToStorage();

  return event;
}

export async function getEvent(id: string): Promise<ScheduledEvent | null> {
  await delay(MOCK_CONFIG.delays.fast);
  return mockEvents.get(id) || null;
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
  events.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());

  return events;
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

  const updatedEvent: ScheduledEvent = {
    ...event,
    ...updates,
    lastModified: new Date(),
    version: event.version + 1,
  };

  mockEvents.set(id, updatedEvent);
  saveEventsToStorage();

  // Broadcast update
  broadcastEventUpdate(id, updatedEvent, updates);

  return updatedEvent;
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

  // Release all locks for this event
  const { releaseAllLocksForTeamLeader } = await import('./drafts.js');
  await releaseAllLocksForTeamLeader(teamLeaderId, id);
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
    .filter((event) => event.scheduledTime > now)
    .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
    .slice(0, limit);
}
