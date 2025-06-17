# Phase 2: Mock API Classes

## Overview

**Duration**: 3-4 days  
**Complexity**: High  
**Goal**: Convert existing mock functions into class-based implementations that conform to Phase 1 interfaces

This is the most complex phase, involving migration of rich mock data functionality into the new architecture while preserving all existing behavior.

## Dependencies

### Required Phase 1 Artifacts

- `lib/api/interfaces/*` - All interface definitions
- `lib/api/factory.ts` - Factory pattern for dependency injection
- Type imports from `@ulti-project/shared` package

### Current Mock System to Migrate

- `lib/mock/events.ts` - Event management functions
- `lib/mock/helpers.ts` - Helper management and availability
- `lib/mock/participants.ts` - Progger data and utilities
- `lib/mock/drafts.ts` - Lock management system
- `lib/mock/config.ts` - Configuration and delays

## Requirements

### Type Safety Requirements

- **MUST** use types from `@ulti-project/shared` package only
- **MUST** implement interfaces from Phase 1 exactly
- **NO** local type definitions allowed
- All method signatures must match interface contracts

### Behavioral Requirements

- **MUST** preserve all existing mock functionality
- **MUST** maintain SSE simulation behavior and timing
- **MUST** preserve session storage persistence
- **MUST** maintain realistic data generation patterns
- **MUST** preserve lock timeout behavior (30 minutes)

### Data Consistency Requirements

- **MUST** maintain relational integrity between entities
- **MUST** preserve cross-entity validation logic
- **MUST** maintain realistic helper availability patterns

## Implementation Tasks

### Task 2.1: Create MockEventsApi Class

#### File: `lib/api/implementations/mock/MockEventsApi.ts`

```typescript
import type {
  CreateEventRequest,
  ScheduledEvent,
  EventFilters,
  UpdateEventRequest,
  EventRoster,
  PartySlot
} from '@ulti-project/shared';
import { EventStatus, Job, Role, Encounter, ParticipantType } from '@ulti-project/shared';
import type { IEventsApi } from '../../interfaces/IEventsApi.js';

export class MockEventsApi implements IEventsApi {
  private events = new Map<string, ScheduledEvent>();
  private eventIdCounter = 1;
  private readonly STORAGE_KEY = 'ulti-project-mock-events';
  private readonly COUNTER_KEY = 'ulti-project-event-counter';

  constructor() {
    this.loadEventsFromStorage();
  }

  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    // Simulate API delay
    await this.delay(500);

    const event: ScheduledEvent = {
      id: `event-${this.eventIdCounter++}`,
      guildId: request.guildId,
      name: request.name,
      encounter: request.encounter,
      scheduledTime: request.scheduledTime,
      duration: request.duration,
      teamLeaderId: request.teamLeaderId,
      teamLeaderName: `Leader-${request.teamLeaderId}`,
      status: EventStatus.Draft,
      roster: this.createEmptyRoster(),
      createdAt: new Date(),
      lastModified: new Date(),
      version: 1
    };

    this.events.set(event.id, event);
    this.saveEventsToStorage();

    return event;
  }

  async getEvent(id: string): Promise<ScheduledEvent | null> {
    await this.delay(100);
    return this.events.get(id) || null;
  }

  async getEvents(filters?: EventFilters): Promise<ScheduledEvent[]> {
    await this.delay(300);
    
    let events = Array.from(this.events.values());

    if (filters?.status) {
      events = events.filter(e => e.status === filters.status);
    }

    if (filters?.encounter) {
      events = events.filter(e => e.encounter === filters.encounter);
    }

    if (filters?.teamLeaderId) {
      events = events.filter(e => e.teamLeaderId === filters.teamLeaderId);
    }

    return events.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }

  async updateEvent(id: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
    await this.delay(400);

    const event = this.events.get(id);
    if (!event) {
      throw new Error(`Event ${id} not found`);
    }

    const updatedEvent: ScheduledEvent = {
      ...event,
      ...updates,
      lastModified: new Date(),
      version: event.version + 1
    };

    this.events.set(id, updatedEvent);
    this.saveEventsToStorage();

    return updatedEvent;
  }

  async deleteEvent(id: string, teamLeaderId: string): Promise<void> {
    await this.delay(200);

    const event = this.events.get(id);
    if (!event) {
      throw new Error(`Event ${id} not found`);
    }

    if (event.teamLeaderId !== teamLeaderId) {
      throw new Error('Only team leader can delete event');
    }

    this.events.delete(id);
    this.saveEventsToStorage();
  }

  private createEmptyRoster(): EventRoster {
    const party: PartySlot[] = [];

    // Create 8 slots (2 tanks, 2 healers, 4 DPS)
    for (let i = 0; i < 8; i++) {
      const slot: PartySlot = {
        id: `slot-${i + 1}`,
        role: i < 2 ? Role.Tank : i < 4 ? Role.Healer : Role.DPS,
        isHelperSlot: i % 2 === 0
      };
      party.push(slot);
    }

    return {
      party,
      totalSlots: 8,
      filledSlots: 0
    };
  }

  private loadEventsFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      const counter = sessionStorage.getItem(this.COUNTER_KEY);

      if (stored) {
        const parsed = JSON.parse(stored);
        this.events = new Map(Object.entries(parsed).map(([id, event]) => [
          id,
          {
            ...event,
            scheduledTime: new Date(event.scheduledTime),
            createdAt: new Date(event.createdAt),
            lastModified: new Date(event.lastModified)
          }
        ]));
      }

      if (counter) {
        this.eventIdCounter = parseInt(counter, 10);
      }

      // Initialize with sample data if empty
      if (this.events.size === 0) {
        this.initializeSampleEvents();
      }
    } catch (error) {
      console.warn('Failed to load events from storage:', error);
      this.initializeSampleEvents();
    }
  }

  private saveEventsToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const eventsObj = Object.fromEntries(this.events);
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(eventsObj));
      sessionStorage.setItem(this.COUNTER_KEY, this.eventIdCounter.toString());
    } catch (error) {
      console.warn('Failed to save events to storage:', error);
    }
  }

  private initializeSampleEvents(): void {
    // Initialize with sample events similar to existing mock data
    const sampleEvents: ScheduledEvent[] = [
      {
        id: 'event-1',
        guildId: 'guild-12345-demo',
        name: 'FRU Prog Session',
        encounter: Encounter.FRU,
        scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 120,
        teamLeaderId: 'leader-1',
        teamLeaderName: 'TeamAlpha',
        status: EventStatus.Draft,
        roster: this.createPartiallyFilledRoster(),
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        lastModified: new Date(Date.now() - 30 * 60 * 1000),
        version: 1
      }
    ];

    sampleEvents.forEach(event => {
      this.events.set(event.id, event);
    });

    this.saveEventsToStorage();
  }

  private createPartiallyFilledRoster(): EventRoster {
    // Implementation to create partially filled roster
    // (Migrate logic from existing mock/events.ts)
    return this.createEmptyRoster(); // Simplified for example
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Task 2.2: Create MockHelpersApi Class

#### File: `lib/api/implementations/mock/MockHelpersApi.ts`

```typescript
import type { HelperData } from '@ulti-project/shared';
import { Job, Role } from '@ulti-project/shared';
import type { IHelpersApi } from '../../interfaces/IHelpersApi.js';

export class MockHelpersApi implements IHelpersApi {
  private helpers: HelperData[] = [];

  constructor() {
    this.initializeMockHelpers();
  }

  async getHelpers(): Promise<HelperData[]> {
    await this.delay(300);
    return [...this.helpers];
  }

  async isHelperAvailableForEvent(
    helperId: string,
    eventStart: Date,
    eventEnd: Date
  ): Promise<{
    available: boolean;
    reason?: 'absent' | 'outside_schedule' | 'available';
  }> {
    await this.delay(100);

    const helper = this.helpers.find(h => h.id === helperId);
    if (!helper) {
      return { available: false, reason: 'outside_schedule' };
    }

    // Check for absences (migrate logic from existing mock)
    // Check weekly availability (migrate logic from existing mock)
    
    return { available: true, reason: 'available' };
  }

  private initializeMockHelpers(): void {
    // Migrate helper data from existing lib/mock/helpers.ts
    this.helpers = [
      {
        id: 'helper-1',
        guildId: 'guild-12345-demo',
        discordId: '123456789012345678',
        name: 'Aether Defender',
        availableJobs: [
          { job: Job.Paladin, role: Role.Tank },
          { job: Job.Warrior, role: Role.Tank },
          { job: Job.DarkKnight, role: Role.Tank }
        ],
        weeklyAvailability: [
          {
            dayOfWeek: 1,
            timeRanges: [{ start: '19:00', end: '23:00' }]
          }
        ]
      }
      // Add more helpers from existing mock data
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Task 2.3: Create MockRosterApi Class

#### File: `lib/api/implementations/mock/MockRosterApi.ts`

```typescript
import type {
  ScheduledEvent,
  AssignParticipantRequest,
  Participant
} from '@ulti-project/shared';
import { ParticipantType, Job, Role, Encounter } from '@ulti-project/shared';
import type { IRosterApi } from '../../interfaces/IRosterApi.js';

export class MockRosterApi implements IRosterApi {
  private proggers: Participant[] = [];

  constructor() {
    this.initializeMockProggers();
  }

  async assignParticipant(
    eventId: string,
    teamLeaderId: string,
    request: AssignParticipantRequest
  ): Promise<ScheduledEvent> {
    await this.delay(400);
    // Implementation for participant assignment
    // Migrate logic from existing mock system
    throw new Error('Not implemented - migrate from existing mock');
  }

  async unassignParticipant(
    eventId: string,
    teamLeaderId: string,
    slotId: string
  ): Promise<ScheduledEvent> {
    await this.delay(300);
    // Implementation for participant removal
    // Migrate logic from existing mock system
    throw new Error('Not implemented - migrate from existing mock');
  }

  async getProggers(filters?: {
    encounter?: string;
    role?: string;
    job?: string;
  }): Promise<Participant[]> {
    await this.delay(300);

    let filtered = [...this.proggers];

    if (filters?.encounter) {
      filtered = filtered.filter(p => p.encounter === filters.encounter);
    }

    if (filters?.job) {
      filtered = filtered.filter(p => p.job === filters.job);
    }

    return filtered;
  }

  async getAllParticipants(filters?: {
    encounter?: string;
    role?: string;
    type?: 'helper' | 'progger';
  }): Promise<Participant[]> {
    await this.delay(300);
    // Combine helpers and proggers based on filters
    // Implementation depends on integration with MockHelpersApi
    return this.proggers;
  }

  private initializeMockProggers(): void {
    // Migrate progger data from existing lib/mock/participants.ts
    this.proggers = [
      {
        type: ParticipantType.Progger,
        id: 'progger-1',
        discordId: '111111111111111111',
        name: 'Warrior Light',
        job: Job.BlackMage,
        encounter: Encounter.FRU,
        progPoint: 'P2 Light Rampant',
        availability: 'Tuesday 8PM EST, Thursday 8PM EST',
        isConfirmed: false
      }
      // Add more proggers from existing mock data
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Task 2.4: Create MockLocksApi Class

#### File: `lib/api/implementations/mock/MockLocksApi.ts`

```typescript
import type {
  DraftLock,
  LockParticipantRequest
} from '@ulti-project/shared';
import type { ILocksApi } from '../../interfaces/ILocksApi.js';

export class MockLocksApi implements ILocksApi {
  private locks = new Map<string, DraftLock>();
  private readonly LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  async lockParticipant(
    eventId: string,
    teamLeaderId: string,
    request: LockParticipantRequest
  ): Promise<DraftLock> {
    await this.delay(200);

    // Check for existing locks (migrate logic from existing mock)
    const existingLock = this.findExistingLock(request.participantId, request.participantType);
    if (existingLock) {
      throw new Error('Participant already locked');
    }

    const lock: DraftLock = {
      id: `lock-${Date.now()}`,
      eventId,
      participantId: request.participantId,
      participantType: request.participantType,
      teamLeaderId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.LOCK_TIMEOUT)
    };

    this.locks.set(lock.id, lock);

    // Set up automatic cleanup
    setTimeout(() => {
      this.locks.delete(lock.id);
    }, this.LOCK_TIMEOUT);

    return lock;
  }

  async releaseLock(
    eventId: string,
    teamLeaderId: string,
    lockId: string
  ): Promise<void> {
    await this.delay(100);

    const lock = this.locks.get(lockId);
    if (!lock) {
      throw new Error('Lock not found');
    }

    if (lock.teamLeaderId !== teamLeaderId) {
      throw new Error('Only lock owner can release');
    }

    this.locks.delete(lockId);
  }

  async getActiveLocks(eventId: string): Promise<DraftLock[]> {
    await this.delay(100);

    // Clean up expired locks
    this.cleanupExpiredLocks();

    return Array.from(this.locks.values())
      .filter(lock => lock.eventId === eventId);
  }

  private findExistingLock(participantId: string, participantType: string): DraftLock | null {
    return Array.from(this.locks.values())
      .find(lock => 
        lock.participantId === participantId && 
        lock.participantType === participantType
      ) || null;
  }

  private cleanupExpiredLocks(): void {
    const now = Date.now();
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAt.getTime() <= now) {
        this.locks.delete(id);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Task 2.5: Create MockSSEApi Class

#### File: `lib/api/implementations/mock/MockSSEApi.ts`

```typescript
import type { ISSEApi } from '../../interfaces/ISSEApi.js';

export class MockSSEApi implements ISSEApi {
  createEventEventSource(eventId: string): EventSource {
    // Migrate SSE simulation from existing mock system
    const mockSource = new MockEventSource(`/mock/events/${eventId}/stream`);
    
    // Simulate periodic updates
    setTimeout(() => {
      const mockEvent = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'event_updated',
          data: { eventId, timestamp: new Date() }
        })
      });
      mockSource.dispatchEvent(mockEvent);
    }, 1000);

    return mockSource as any;
  }

  createDraftLocksEventSource(eventId: string): EventSource {
    // Implementation for lock updates SSE
    return new MockEventSource(`/mock/locks/${eventId}/stream`) as any;
  }

  createHelpersEventSource(): EventSource {
    // Implementation for helper updates SSE
    return new MockEventSource('/mock/helpers/stream') as any;
  }
}

// Mock EventSource implementation (migrate from existing mock)
class MockEventSource extends EventTarget {
  public readyState = 1; // OPEN
  public url: string;

  constructor(url: string) {
    super();
    this.url = url;
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // EventSource interface implementation
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
}
```

### Task 2.6: Create Mock Implementation Factory

#### File: `lib/api/implementations/mock/index.ts`

```typescript
import type { IApiClient } from '../../interfaces/IApiClient.js';
import { MockEventsApi } from './MockEventsApi.js';
import { MockHelpersApi } from './MockHelpersApi.js';
import { MockRosterApi } from './MockRosterApi.js';
import { MockLocksApi } from './MockLocksApi.js';
import { MockSSEApi } from './MockSSEApi.js';

export async function createMockApiClient(): Promise<IApiClient> {
  return {
    events: new MockEventsApi(),
    helpers: new MockHelpersApi(),
    roster: new MockRosterApi(),
    locks: new MockLocksApi(),
    sse: new MockSSEApi()
  };
}
```

## Validation Criteria

### Phase 2 Completion Checklist

- [ ] All mock API classes implement their respective interfaces
- [ ] All existing mock functionality is preserved
- [ ] SSE simulation behavior matches existing implementation
- [ ] Session storage persistence works for events
- [ ] Lock timeout behavior (30 minutes) is maintained
- [ ] Helper availability logic is preserved
- [ ] Realistic data generation patterns continue working
- [ ] All method signatures match interface contracts exactly
- [ ] No local type definitions exist
- [ ] All imports use `@ulti-project/shared` types

### Data Consistency Testing

```typescript
// Test to verify data consistency
describe('Mock API Data Consistency', () => {
  it('should maintain relational integrity', async () => {
    const apiClient = await createMockApiClient();
    
    // Test event creation
    const event = await apiClient.events.createEvent({
      guildId: 'test-guild',
      name: 'Test Event',
      encounter: Encounter.FRU,
      scheduledTime: new Date(),
      duration: 120,
      teamLeaderId: 'leader-1'
    });
    
    // Test helper availability
    const helpers = await apiClient.helpers.getHelpers();
    expect(helpers.length).toBeGreaterThan(0);
    
    // Test lock creation
    const lock = await apiClient.locks.lockParticipant(
      event.id,
      'leader-1',
      { participantId: 'helper-1', participantType: 'helper' }
    );
    
    expect(lock.eventId).toBe(event.id);
  });
});
```

### Performance Requirements

- Mock API responses should simulate realistic network delays
- SSE simulation should not impact browser performance
- Session storage operations should be efficient

## Migration Strategy

### Incremental Migration Approach

1. **Start with MockEventsApi** - Core functionality, highest complexity
2. **Add MockHelpersApi** - Independent helper management
3. **Implement MockRosterApi** - Depends on events and helpers integration
4. **Create MockLocksApi** - Independent lock management
5. **Finish with MockSSEApi** - Real-time simulation

### Data Migration Priority

1. **Event management** - Core entity with roster composition
2. **Helper data** - Rich availability and job information
3. **Lock system** - Complex timeout and conflict logic
4. **SSE simulation** - Real-time update patterns

### Risk Mitigation

- Preserve exact data structures from existing mock system
- Maintain timing patterns for SSE simulation
- Test integration between different API domains
- Validate session storage persistence behavior

This phase creates fully functional mock implementations that maintain all existing behavior while conforming to the new interface contracts.
