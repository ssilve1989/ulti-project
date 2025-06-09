# Scheduling Mock API

This directory contains a comprehensive mock API system for the scheduling feature, designed to enable frontend development without requiring the backend to be implemented.

## Overview

The mock API provides:

- **Real-time collaboration** simulation with SSE streams
- **Draft lock management** with 30-minute timeouts
- **Helper and progger management** with realistic data
- **Event lifecycle management** (draft → published → in-progress → completed)
- **Conflict resolution** for concurrent team leader actions

## File Structure

```
mock/
├── index.ts          # Main exports and configuration
├── types.ts          # Re-exports from @ulti-project/shared
├── helpers.ts        # Helper management and SSE simulation
├── participants.ts   # Progger data and participant utilities
├── drafts.ts         # Draft lock system with real-time updates
├── events.ts         # Event management and roster building
└── README.md         # This file
```

**Note**: All TypeScript type definitions are now located in `packages/shared/src/types/scheduling.ts` and are shared between the frontend mock API and the backend implementation.

## Usage

### Basic API Usage

```typescript
import {
  createEvent,
  getEvents,
  assignParticipant,
  lockParticipant,
  getHelpers,
  getProggers,
} from '../schedulingApi.js';

// Import types from shared package
import type { 
  CreateEventRequest, 
  ScheduledEvent, 
  Encounter 
} from '@ulti-project/shared';

// Create a new event
const event = await createEvent({
  name: 'FRU Prog Session',
  encounter: Encounter.FRU,
  scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
  duration: 120,
  teamLeaderId: 'leader-1',
});

// Get available helpers
const helpers = await getHelpers();

// Lock a participant for drafting
const lock = await lockParticipant('event-1', 'leader-1', {
  participantId: 'helper-1',
  participantType: 'helper',
});

// Assign participant to a slot
const updatedEvent = await assignParticipant('event-1', 'leader-1', {
  participantId: 'helper-1',
  participantType: 'helper',
  slotId: 'party-0-tank-1',
  selectedJob: 'Paladin',
});
```

### Real-time Updates with SSE

```typescript
import { createEventEventSource, createDraftLocksEventSource } from '../schedulingApi.js';

// Listen for event updates
const eventSource = createEventEventSource('event-1');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event update:', data);
};

// Listen for draft lock changes
const lockSource = createDraftLocksEventSource('event-1');
lockSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Lock update:', data);
};
```

## Key Features

### 1. Draft Lock System

- **30-minute timeout** on participant locks
- **Conflict detection** when multiple team leaders want the same participant
- **Real-time notifications** when locks are created/released/expired
- **Automatic cleanup** of expired locks

### 2. Helper Management

- **Multi-job support** - helpers can play multiple jobs/roles
- **Availability tracking** - absence periods for scheduling conflicts
- **Real-time updates** - helper data changes via SSE

### 3. Event Lifecycle

- **Draft → Published → In Progress → Completed** workflow
- **Modification restrictions** - can't edit in-progress events
- **Version control** - optimistic locking for concurrent edits
- **Team leader permissions** - only event creator can modify

### 4. Participant Assignment

- **Role validation** - ensures participants are assigned to appropriate slots
- **Availability checking** - prevents double-booking of helpers
- **Job selection** - team leaders choose specific job for each assignment
- **Real-time updates** - all team leaders see assignments immediately

## Mock Data

### Sample Events

- **FRU Prog Session** (draft, tomorrow)
- **TOP Clear Run** (published, day after tomorrow)

### Sample Helpers

- **TankMaster** - PLD, WAR, DRK
- **HealBot** - WHM, SCH, AST, SGE
- **DPSGod** - BLM, SMN, RDM, DRG
- **FlexPlayer** - GNB, SGE, RPR, DNC
- **RangedExpert** - BRD, MCH, DNC
- **MeleeMain** - MNK, DRG, NIN, SAM, RPR

### Sample Proggers

- **8 proggers** across different encounters (FRU, TOP, DSR, TEA, UWU, UCOB)
- **Realistic prog points** matching current content requirements
- **Free-form availability** text for team leader reference

## Configuration

```typescript
// Mock API configuration in index.ts
export const MOCK_CONFIG = {
  delays: {
    fast: 100,    // Quick operations like locks
    medium: 300,  // Standard API calls
    slow: 800,    // Complex operations like event creation
  },
  
  sse: {
    heartbeat: 30000,     // 30 seconds
    dataUpdate: 5000,     // 5 seconds
    lockExpiry: 1800000,  // 30 minutes
  },
  
  draftTimeout: 30 * 60 * 1000, // 30 minutes
};
```

## Development Tools

In development mode, debugging utilities are available:

```typescript
// Access via browser console
window.__schedulingDevUtils.getAllMockData();
window.__schedulingDevUtils.resetMockData();
```

## SSE Event Types

### Event Updates

- `event_updated` - Event details changed
- `participant_assigned` - Participant assigned to slot
- `participant_unassigned` - Participant removed from slot

### Draft Locks

- `draft_lock_created` - New lock created
- `draft_lock_released` - Lock manually released
- `draft_lock_expired` - Lock automatically expired
- `draft_lock_extended` - Lock timeout extended

## Error Handling

The mock API includes realistic error scenarios:

```typescript
// Conflict when participant is already locked
try {
  await lockParticipant('event-1', 'leader-2', {
    participantId: 'helper-1',
    participantType: 'helper',
  });
} catch (error) {
  if (error.code === 'CONFLICT') {
    console.log('Participant locked by:', error.conflictDetails.currentHolder);
    console.log('Lock expires at:', error.conflictDetails.lockExpiresAt);
  }
}
```

## Integration with Real API

The mock API is designed to be easily replaceable with real backend calls:

```typescript
// In schedulingApi.ts
const USE_MOCK_DATA = import.meta.env.DEV; // Use mock in dev, real in prod

export async function createEvent(request: CreateEventRequest) {
  if (USE_MOCK_DATA) {
    return mockCreateEvent(request);
  }
  
  // Real API call
  const response = await fetch('/api/events', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return response.json();
}
```

This allows seamless transition from mock to real API without changing frontend code.
