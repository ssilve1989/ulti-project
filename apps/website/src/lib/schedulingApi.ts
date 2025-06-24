import type {
  CreateEventRequest,
  DraftLock,
  EventFilters,
  HelperData,
  LockParticipantRequest,
  Participant,
  ScheduledEvent,
  UpdateEventRequest,
} from '@ulti-project/shared';

// TODO: Remvoe this re-export
// Re-export types for convenience
export type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  HelperData,
  Participant,
  DraftLock,
  LockParticipantRequest,
};

const USE_MOCK_DATA = true; // Always use mock data for now

export async function getEvents(
  filters?: EventFilters,
): Promise<ScheduledEvent[]> {
  if (USE_MOCK_DATA) {
    const { getEvents: mockGetEvents } = await import('./mock/events.js');
    return mockGetEvents(filters);
  }

  throw new Error('Real API not implemented yet');
}
