// Scheduling API integration
// This file provides a clean interface to the scheduling mock API

import type {
  AssignParticipantRequest,
  CreateEventRequest,
  DraftLock,
  EventFilters,
  HelperData,
  LockParticipantRequest,
  Participant,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';

// Re-export types for convenience
export type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  AssignParticipantRequest,
  EventFilters,
  HelperData,
  Participant,
  DraftLock,
  LockParticipantRequest,
};

// Development mode detection
const isDevelopment = import.meta.env.DEV;
const USE_MOCK_DATA = true; // Always use mock data for now

// Event Management API
export async function createEvent(
  request: CreateEventRequest,
): Promise<ScheduledEvent> {
  if (USE_MOCK_DATA) {
    const { createEvent: mockCreateEvent } = await import('./mock/events.js');
    return mockCreateEvent(request);
  }

  // Real API implementation would go here
  throw new Error('Real API not implemented yet');
}

export async function getEvent(id: string): Promise<ScheduledEvent | null> {
  if (USE_MOCK_DATA) {
    const { getEvent: mockGetEvent } = await import('./mock/events.js');
    return mockGetEvent(id);
  }

  throw new Error('Real API not implemented yet');
}

export async function getEvents(
  filters?: EventFilters,
): Promise<ScheduledEvent[]> {
  if (USE_MOCK_DATA) {
    const { getEvents: mockGetEvents } = await import('./mock/events.js');
    return mockGetEvents(filters);
  }

  throw new Error('Real API not implemented yet');
}

export async function updateEvent(
  id: string,
  updates: UpdateEventRequest,
): Promise<ScheduledEvent> {
  if (USE_MOCK_DATA) {
    const { updateEvent: mockUpdateEvent } = await import('./mock/events.js');
    return mockUpdateEvent(id, updates);
  }

  throw new Error('Real API not implemented yet');
}

export async function deleteEvent(
  id: string,
  teamLeaderId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    const { deleteEvent: mockDeleteEvent } = await import('./mock/events.js');
    return mockDeleteEvent(id, teamLeaderId);
  }

  throw new Error('Real API not implemented yet');
}

// Participant Management API
export async function assignParticipant(
  eventId: string,
  teamLeaderId: string,
  request: AssignParticipantRequest,
): Promise<ScheduledEvent> {
  if (USE_MOCK_DATA) {
    const { assignParticipant: mockAssignParticipant } = await import(
      './mock/events.js'
    );
    return mockAssignParticipant(eventId, teamLeaderId, request);
  }

  throw new Error('Real API not implemented yet');
}

export async function unassignParticipant(
  eventId: string,
  teamLeaderId: string,
  slotId: string,
): Promise<ScheduledEvent> {
  if (USE_MOCK_DATA) {
    const { unassignParticipant: mockUnassignParticipant } = await import(
      './mock/events.js'
    );
    return mockUnassignParticipant(eventId, teamLeaderId, slotId);
  }

  throw new Error('Real API not implemented yet');
}

// Helper Management API
export async function getHelpers(): Promise<HelperData[]> {
  if (USE_MOCK_DATA) {
    const { getHelpers: mockGetHelpers } = await import('./mock/helpers.js');
    return mockGetHelpers();
  }

  throw new Error('Real API not implemented yet');
}

export async function getProggers(filters?: {
  encounter?: string;
  role?: string;
  job?: string;
}): Promise<Participant[]> {
  if (USE_MOCK_DATA) {
    const { getProggers: mockGetProggers } = await import(
      './mock/participants.js'
    );
    return mockGetProggers(filters);
  }

  throw new Error('Real API not implemented yet');
}

export async function getAllParticipants(filters?: {
  encounter?: string;
  role?: string;
  type?: 'helper' | 'progger';
}): Promise<Participant[]> {
  if (USE_MOCK_DATA) {
    const { getAllParticipants: mockGetAllParticipants } = await import(
      './mock/participants.js'
    );
    return mockGetAllParticipants(filters);
  }

  throw new Error('Real API not implemented yet');
}

// Draft Lock Management API
export async function lockParticipant(
  eventId: string,
  teamLeaderId: string,
  request: LockParticipantRequest,
): Promise<DraftLock> {
  if (USE_MOCK_DATA) {
    const { lockParticipant: mockLockParticipant } = await import(
      './mock/drafts.js'
    );
    return mockLockParticipant(eventId, teamLeaderId, request);
  }

  throw new Error('Real API not implemented yet');
}

export async function releaseLock(
  eventId: string,
  teamLeaderId: string,
  participantId: string,
  participantType: 'helper' | 'progger',
): Promise<void> {
  if (USE_MOCK_DATA) {
    const { releaseLock: mockReleaseLock } = await import('./mock/drafts.js');
    return mockReleaseLock(
      eventId,
      teamLeaderId,
      participantId,
      participantType,
    );
  }

  throw new Error('Real API not implemented yet');
}

export async function getActiveLocks(eventId?: string): Promise<DraftLock[]> {
  if (USE_MOCK_DATA) {
    const { getActiveLocks: mockGetActiveLocks } = await import(
      './mock/drafts.js'
    );
    return mockGetActiveLocks(eventId);
  }

  throw new Error('Real API not implemented yet');
}

// SSE Event Sources
export function createEventEventSource(eventId: string): EventSource {
  if (USE_MOCK_DATA) {
    // Dynamic import for SSE functions
    import('./mock/events.js').then(({ createEventEventSource }) => {
      return createEventEventSource(eventId);
    });
  }

  throw new Error('Real SSE not implemented yet');
}

export function createHelpersEventSource(): EventSource {
  if (USE_MOCK_DATA) {
    import('./mock/helpers.js').then(({ createHelpersEventSource }) => {
      return createHelpersEventSource();
    });
  }

  throw new Error('Real SSE not implemented yet');
}

export function createDraftLocksEventSource(eventId: string): EventSource {
  if (USE_MOCK_DATA) {
    import('./mock/drafts.js').then(({ createDraftLocksEventSource }) => {
      return createDraftLocksEventSource(eventId);
    });
  }

  throw new Error('Real SSE not implemented yet');
}

// Utility functions for development
export const devUtils = isDevelopment
  ? {
      // Get all mock data for debugging
      async getAllMockData() {
        const [events, helpers, proggers, locks] = await Promise.all([
          getEvents(),
          getHelpers(),
          getProggers(),
          getActiveLocks(),
        ]);

        return {
          events,
          helpers,
          proggers,
          locks,
        };
      },

      // Reset all mock data
      async resetMockData() {
        // This would clear all in-memory data and reinitialize
        console.log('Mock data reset functionality would go here');
      },
    }
  : null;

// Make dev utils available globally in development
if (isDevelopment && typeof window !== 'undefined') {
  (window as any).__schedulingDevUtils = devUtils;
}
