# Shared Package Integration Guide

## Overview

The `@ulti-project/shared` package is the **sole source of truth** for all API types and schemas. This guide explains how to properly import and use shared types in the migration.

## Package Structure

```typescript
packages/shared/src/
├── index.ts                     # Main exports
├── types/
│   ├── scheduling.ts           # Scheduling domain types
│   ├── encounters.ts           # Game encounter definitions
│   └── community.ts            # Community/guild types
└── schemas/
    └── api/
        ├── common.ts           # Shared enums and base types
        ├── events.ts           # Event API schemas
        ├── helpers.ts          # Helper API schemas
        ├── roster.ts           # Roster API schemas
        └── locks.ts            # Lock API schemas
```

## Core Types for Migration

### Scheduling Types (`@ulti-project/shared`)

#### Event Management

```typescript
import type {
  // Event entities
  ScheduledEvent,
  EventRoster,
  PartySlot,
  
  // Request/Response types
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  
  // Enums
  EventStatus
} from '@ulti-project/shared';
```

#### Helper Management

```typescript
import type {
  // Helper entities
  HelperData,
  HelperAbsence,
  HelperWeeklyAvailability,
  
  // Request/Response types
  CheckHelperAvailabilityRequest,
  HelperAvailabilityResponse,
  CreateAbsenceRequest
} from '@ulti-project/shared';
```

#### Roster Management

```typescript
import type {
  // Participant entities
  Participant,
  ParticipantType,
  
  // Request/Response types
  AssignParticipantRequest,
  UnassignParticipantRequest
} from '@ulti-project/shared';
```

#### Lock Management

```typescript
import type {
  // Lock entities
  DraftLock,
  
  // Request/Response types
  LockParticipantRequest,
  ReleaseLockRequest
} from '@ulti-project/shared';
```

### Common Enums (`@ulti-project/shared`)

```typescript
import {
  // Job definitions
  Job,              // Paladin, Warrior, WhiteMage, etc.
  Role,             // Tank, Healer, DPS
  
  // Event states
  EventStatus,      // Draft, Published, InProgress, Completed
  
  // Participant types
  ParticipantType,  // Helper, Progger
  
  // Encounter definitions
  Encounter         // FRU, TOP, DSR, etc.
} from '@ulti-project/shared';
```

## Import Patterns

### ✅ Correct Import Pattern

```typescript
// API Interface Definition
import type {
  CreateEventRequest,
  ScheduledEvent,
  EventFilters,
  UpdateEventRequest
} from '@ulti-project/shared';

export interface IEventsApi {
  createEvent(request: CreateEventRequest): Promise<ScheduledEvent>;
  getEvent(id: string): Promise<ScheduledEvent | null>;
  getEvents(filters?: EventFilters): Promise<ScheduledEvent[]>;
  updateEvent(id: string, updates: UpdateEventRequest): Promise<ScheduledEvent>;
}
```

### ✅ Implementation with Shared Types

```typescript
// Mock Implementation
import type { CreateEventRequest, ScheduledEvent } from '@ulti-project/shared';
import { EventStatus, Job, Role } from '@ulti-project/shared';

export class MockEventsApi implements IEventsApi {
  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    const event: ScheduledEvent = {
      id: `event-${Date.now()}`,
      guildId: request.guildId,
      name: request.name,
      encounter: request.encounter,
      scheduledTime: request.scheduledTime,
      duration: request.duration,
      teamLeaderId: request.teamLeaderId,
      teamLeaderName: `Leader-${request.teamLeaderId}`,
      status: EventStatus.Draft, // Using shared enum
      roster: this.createEmptyRoster(),
      createdAt: new Date(),
      lastModified: new Date(),
      version: 1
    };
    
    return event;
  }
}
```

### ❌ Incorrect Patterns to Avoid

```typescript
// ❌ DON'T: Define local types
interface LocalCreateEventRequest {
  name: string;
  // ...
}

// ❌ DON'T: Use string literals instead of enums
const status = 'Draft'; // Should use EventStatus.Draft

// ❌ DON'T: Import from internal paths
import { CreateEventRequest } from '@ulti-project/shared/src/types/scheduling';
```

## Key Types by Domain

### Events Domain

#### Core Types

- `ScheduledEvent` - Complete event entity
- `EventRoster` - Party composition with slots
- `PartySlot` - Individual roster position
- `EventStatus` - Draft | Published | InProgress | Completed

#### Request/Response Types

- `CreateEventRequest` - Event creation payload
- `UpdateEventRequest` - Event modification payload
- `EventFilters` - Query filters for event listing

### Helpers Domain

#### Core Types

- `HelperData` - Helper profile with jobs and availability
- `HelperAbsence` - Unavailability period
- `HelperWeeklyAvailability` - Recurring schedule

#### Request/Response Types

- `CheckHelperAvailabilityRequest` - Availability check payload
- `HelperAvailabilityResponse` - Availability check result
- `CreateAbsenceRequest` - Absence creation payload

### Roster Domain

#### Core Types

- `Participant` - Player in an event (helper or progger)
- `ParticipantType` - Helper | Progger enum

#### Request/Response Types

- `AssignParticipantRequest` - Assignment payload
- `UnassignParticipantRequest` - Removal payload

### Locks Domain

#### Core Types

- `DraftLock` - Temporary reservation on participant

#### Request/Response Types

- `LockParticipantRequest` - Lock creation payload
- `ReleaseLockRequest` - Lock release payload

## Type Safety Validation

### Interface Conformance

```typescript
// TypeScript will enforce that implementations match interface contracts
class MockEventsApi implements IEventsApi {
  // This MUST return exactly ScheduledEvent type
  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    // TypeScript ensures request has all required properties
    // TypeScript ensures return value matches ScheduledEvent shape
    return event;
  }
}
```

### Enum Usage

```typescript
// ✅ Use shared enums for consistency
import { EventStatus, Job, Role } from '@ulti-project/shared';

const event: ScheduledEvent = {
  status: EventStatus.Draft,  // Type-safe enum value
  // ...
};

// ✅ Helper job validation
const isValidJob = (job: string): job is Job => {
  return Object.values(Job).includes(job as Job);
};
```

## Migration Implementation Notes

### For Interface Definitions (Phase 1)

- Import ALL types from `@ulti-project/shared`
- Use type-only imports (`import type`) for interfaces
- Import actual values for enums and constants

### For Mock Implementations (Phase 2)

- Import shared types for all method signatures
- Import shared enums for data generation
- Ensure mock data conforms to shared type shapes

### For HTTP Implementations (Phase 3)

- Use shared types for request/response handling
- Import shared enums for status codes and validation
- Ensure API responses match shared type contracts

## Common Pitfalls to Avoid

1. **Local Type Definitions**: Never define types locally that exist in shared package
2. **String Literals**: Always use shared enums instead of string literals
3. **Internal Imports**: Only import from `@ulti-project/shared`, not internal paths
4. **Missing Types**: If a type doesn't exist in shared package, it should be added there first

## Verification Checklist

Before completing any phase, verify:

- [ ] All imports are from `@ulti-project/shared`
- [ ] No local type definitions exist
- [ ] All enums use shared constants
- [ ] TypeScript compilation succeeds without errors
- [ ] Interface implementations match exactly
- [ ] Mock data conforms to shared type shapes

This guide ensures consistent type usage across all migration phases and implementations.
