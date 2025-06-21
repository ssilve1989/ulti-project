# Phase 2: Mock Enhancement

## Overview

**Duration**: 2-3 days  
**Complexity**: Medium  
**Goal**: Enhance existing mock functions to implement Phase 1 interfaces while preserving all current functionality

**Strategy**: **Evolutionary Enhancement** - Add guild parameters and interface wrappers to existing mock functions

## 🔄 Implementation Tasks

### Task Overview

Phase 2 is broken down into **5 granular tasks** that must be completed sequentially:

1. **Task 2.1**: Enhance Events mock functions
2. **Task 2.2**: Create unified Participants mock functions  
3. **Task 2.3**: Enhance Helpers mock functions
4. **Task 2.4**: Update Locks mock functions
5. **Task 2.5**: Create interface wrapper implementations

Each task preserves existing functionality while adding interface compliance.

---

## Task 2.1: Enhance Events Mock Functions

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Phase 1 complete

### Inputs

- Phase 1 interface definitions (`IEventsApi`)
- Existing `src/lib/mock/events.ts` file
- Current function implementations to preserve

### Outputs

- Enhanced `src/lib/mock/events.ts` with guild parameters
- Backward-compatible function signatures
- New pagination support methods

### Implementation

**Step 2.1.1**: Add guild parameter support to existing functions

**File**: `src/lib/mock/events.ts` (MODIFY existing functions)

```typescript
// Add guild-aware versions alongside existing functions
import type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  EventStatus
} from '@ulti-project/shared';

// Enhanced function with guild parameter
export async function createEventWithGuild(
  guildId: string,
  request: CreateEventRequest
): Promise<ScheduledEvent> {
  // Validate guild context
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  // Use existing createEvent logic
  return createEvent(request);
}

// Enhanced function with pagination
export async function getEventsWithGuild(
  guildId: string,
  filters?: EventFilters
): Promise<{ events: ScheduledEvent[]; total: number; hasMore: boolean }> {
  // Validate guild context
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  // Use existing getEvents logic
  const events = await getEvents(filters);
  
  // Add pagination metadata
  return {
    events,
    total: events.length,
    hasMore: false
  };
}

// Add remaining enhanced functions...
export async function getEventWithGuild(guildId: string, eventId: string): Promise<ScheduledEvent | null> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  return getEvent(eventId);
}

export async function updateEventWithGuild(
  guildId: string,
  eventId: string,
  updates: UpdateEventRequest
): Promise<ScheduledEvent> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  return updateEvent(eventId, updates);
}

export async function deleteEventWithGuild(
  guildId: string,
  eventId: string,
  teamLeaderId: string
): Promise<void> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  return deleteEvent(eventId, teamLeaderId);
}

// Keep all existing functions unchanged for backward compatibility
// ...existing code remains exactly the same...
```

### Acceptance Criteria

- [ ] All existing functions remain unchanged and functional
- [ ] New guild-aware functions added with validation
- [ ] Pagination support added to events retrieval
- [ ] Guild validation implemented consistently
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] All imports use `@ulti-project/shared` types only

### Validation Commands

```bash
# Verify existing functionality preserved
grep -n "export async function createEvent(" apps/website/src/lib/mock/events.ts

# Verify new guild functions added
grep -n "WithGuild" apps/website/src/lib/mock/events.ts

# Verify TypeScript compilation
pnpm --filter website run type-check
```

### File Operations

- **MODIFY**: `src/lib/mock/events.ts` (add guild functions, preserve existing)
- **NO CHANGES**: All other files remain unchanged

---

## Task 2.2: Create Unified Participants Mock Functions

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 2.1 complete

### Inputs

- Existing `src/lib/mock/participants.ts` functions
- Existing `src/lib/mock/helpers.ts` helper data
- API specification requirements for unified participant access

### Outputs

- New unified `getParticipants` function with guild support
- Preserved existing helper and progger functions

### Implementation

**Step 2.2.1**: Add unified participants function

**File**: `src/lib/mock/participants.ts` (MODIFY to add new function)

```typescript
import type { Participant, ParticipantType, Job, Role } from '@ulti-project/shared';
import { getHelpers } from './helpers.js';

// New unified function for API specification compliance
export async function getParticipantsWithGuild(
  guildId: string,
  filters?: {
    encounter?: string;
    type?: ParticipantType;
    role?: Role;
    job?: Job;
  }
): Promise<Participant[]> {
  // Validate guild context
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  let participants: Participant[] = [];
  
  // Get helpers if requested
  if (!filters?.type || filters.type === 'helper') {
    const helpers = await getHelpers();
    const helperParticipants = helpers.map(helper => ({
      ...helper,
      type: 'helper' as const
    }));
    participants.push(...helperParticipants);
  }
  
  // Get proggers if requested  
  if (!filters?.type || filters.type === 'progger') {
    const proggers = await getProggers(filters);
    participants.push(...proggers);
  }
  
  // Apply additional filters
  if (filters?.encounter) {
    participants = participants.filter(p => 
      p.encounters?.includes(filters.encounter!)
    );
  }
  
  if (filters?.role) {
    participants = participants.filter(p => p.role === filters.role);
  }
  
  if (filters?.job) {
    participants = participants.filter(p => p.job === filters.job);
  }
  
  return participants;
}

// All existing functions remain unchanged
// ...existing code preserved...
```

### Acceptance Criteria

- [ ] New unified `getParticipantsWithGuild` function created
- [ ] Function combines helpers and proggers correctly
- [ ] All filtering logic implemented
- [ ] Guild validation implemented
- [ ] Existing functions remain unchanged
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify new function added
grep -n "getParticipantsWithGuild" apps/website/src/lib/mock/participants.ts

# Verify existing functions preserved
grep -n "export async function getProggers" apps/website/src/lib/mock/participants.ts

# Test TypeScript compilation
pnpm --filter website run type-check
```

### File Operations

- **MODIFY**: `src/lib/mock/participants.ts` (add unified function)
- **NO CHANGES**: All other mock files remain unchanged

---

## Task 2.3: Enhance Helpers Mock Functions

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 2.2 complete

### Inputs

- Existing `src/lib/mock/helpers.ts` functions
- Phase 1 `IHelpersApi` interface requirements
- Guild parameter patterns from previous tasks

### Outputs

- Enhanced helpers functions with guild support
- New absence management functions

### Implementation

**Step 2.3.1**: Add guild-aware helper functions

**File**: `src/lib/mock/helpers.ts` (MODIFY to add guild functions)

```typescript
import type {
  HelperData,
  HelperAbsence,
  CheckHelperAvailabilityRequest,
  HelperAvailabilityResponse,
  CreateAbsenceRequest,
  Job,
  Role
} from '@ulti-project/shared';

// Guild-aware versions of existing functions
export async function getHelpersWithGuild(guildId: string): Promise<HelperData[]> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  return getHelpers();
}

export async function getHelperWithGuild(guildId: string, helperId: string): Promise<HelperData | null> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  const helpers = await getHelpers();
  return helpers.find(h => h.id === helperId) || null;
}

export async function checkHelperAvailabilityWithGuild(
  guildId: string,
  request: CheckHelperAvailabilityRequest
): Promise<HelperAvailabilityResponse> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  // Use existing availability checking logic
  const available = await isHelperAvailableForEvent(
    request.helperId,
    request.startTime,
    request.endTime
  );
  
  return {
    available: available.available,
    reason: available.reason || 'available'
  };
}

// New absence management functions
export async function createAbsenceWithGuild(
  guildId: string,
  helperId: string,
  absence: CreateAbsenceRequest
): Promise<HelperAbsence> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  const newAbsence: HelperAbsence = {
    id: `absence_${Date.now()}`,
    helperId,
    startDate: absence.startDate,
    endDate: absence.endDate,
    reason: absence.reason,
    createdAt: new Date()
  };
  
  // Store in session storage for persistence
  const storageKey = `helper_absences_${helperId}`;
  const existing = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
  existing.push(newAbsence);
  sessionStorage.setItem(storageKey, JSON.stringify(existing));
  
  return newAbsence;
}

export async function getAbsencesWithGuild(
  guildId: string,
  helperId: string,
  startDate?: Date,
  endDate?: Date
): Promise<HelperAbsence[]> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  const storageKey = `helper_absences_${helperId}`;
  let absences: HelperAbsence[] = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
  
  // Filter by date range if provided
  if (startDate || endDate) {
    absences = absences.filter(absence => {
      const absenceStart = new Date(absence.startDate);
      const absenceEnd = new Date(absence.endDate);
      
      if (startDate && absenceEnd < startDate) return false;
      if (endDate && absenceStart > endDate) return false;
      
      return true;
    });
  }
  
  return absences;
}

// All existing functions remain unchanged
// ...existing code preserved...
```

### Acceptance Criteria

- [ ] Guild-aware helper functions added
- [ ] New absence management functions implemented
- [ ] Session storage used for absence persistence
- [ ] All existing functions remain unchanged
- [ ] Guild validation implemented consistently
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify new guild functions
grep -n "WithGuild" apps/website/src/lib/mock/helpers.ts

# Verify absence functions
grep -n "createAbsenceWithGuild\|getAbsencesWithGuild" apps/website/src/lib/mock/helpers.ts

# Test compilation
pnpm --filter website run type-check
```

### File Operations

- **MODIFY**: `src/lib/mock/helpers.ts` (add guild and absence functions)
- **NO CHANGES**: All other files remain unchanged

---

## Task 2.4: Update Locks Mock Functions

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 2.3 complete

### Inputs

- Existing `src/lib/mock/drafts.ts` lock functions
- Phase 1 `ILocksApi` interface requirements
- Guild parameter patterns

### Outputs

- Enhanced lock functions with guild support
- Participant-based lock release methods

### Implementation

**Step 2.4.1**: Add guild-aware lock functions

**File**: `src/lib/mock/drafts.ts` (MODIFY to add guild functions)

```typescript
import type { DraftLock, LockParticipantRequest, ReleaseLockRequest } from '@ulti-project/shared';

// Guild-aware lock functions
export async function lockParticipantWithGuild(
  guildId: string,
  eventId: string,
  request: LockParticipantRequest
): Promise<DraftLock> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  // Use existing lock logic
  return lockParticipant(eventId, request.teamLeaderId, request);
}

export async function releaseLockWithGuild(
  guildId: string,
  eventId: string,
  request: ReleaseLockRequest
): Promise<void> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  // Find and release lock by participant
  const locks = await getActiveLocks(eventId);
  const lock = locks.find(l => 
    l.participantId === request.participantId && 
    l.teamLeaderId === request.teamLeaderId
  );
  
  if (lock) {
    return releaseLock(eventId, request.teamLeaderId, lock.id);
  }
}

export async function getActiveLocksWithGuild(
  guildId: string,
  eventId: string
): Promise<DraftLock[]> {
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }
  
  return getActiveLocks(eventId);
}

// All existing functions remain unchanged
// ...existing code preserved...
```

### Acceptance Criteria

- [ ] Guild-aware lock functions added
- [ ] Participant-based lock release implemented
- [ ] All existing lock logic preserved
- [ ] Guild validation implemented
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify guild lock functions
grep -n "WithGuild" apps/website/src/lib/mock/drafts.ts

# Verify participant-based release
grep -n "releaseLockWithGuild" apps/website/src/lib/mock/drafts.ts

# Test compilation
pnpm --filter website run type-check
```

### File Operations

- **MODIFY**: `src/lib/mock/drafts.ts` (add guild functions)
- **NO CHANGES**: All other files remain unchanged

---

## Task 2.5: Create Interface Wrapper Implementations

**Duration**: 60 minutes  
**Complexity**: Medium  
**Dependencies**: Tasks 2.1-2.4 complete

### Inputs

- All enhanced mock functions from previous tasks
- Phase 1 interface definitions
- Guild context patterns

### Outputs

- Complete interface wrapper implementations
- Factory registration for mock implementations

### Implementation

**Step 2.5.1**: Create Events API implementation

**File**: `src/lib/api/implementations/mock/EventsApi.ts` (CREATE NEW)

```typescript
import type { IEventsApi, IApiContext, IPaginatedResponse } from '../../interfaces/index.js';
import type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  EventStatus
} from '@ulti-project/shared';
import {
  createEventWithGuild,
  getEventWithGuild,
  getEventsWithGuild,
  updateEventWithGuild,
  deleteEventWithGuild
} from '../../../mock/events.js';

export class MockEventsApi implements IEventsApi {
  constructor(public readonly context: IApiContext) {}

  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    return createEventWithGuild(this.context.guildId, request);
  }

  async getEvent(eventId: string): Promise<ScheduledEvent | null> {
    return getEventWithGuild(this.context.guildId, eventId);
  }

  async getEvents(filters?: EventFilters): Promise<IPaginatedResponse<ScheduledEvent>> {
    return getEventsWithGuild(this.context.guildId, filters);
  }

  async updateEvent(eventId: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
    return updateEventWithGuild(this.context.guildId, eventId, updates);
  }

  async deleteEvent(eventId: string, teamLeaderId: string): Promise<void> {
    return deleteEventWithGuild(this.context.guildId, eventId, teamLeaderId);
  }

  async updateEventStatus(eventId: string, status: EventStatus): Promise<ScheduledEvent> {
    const event = await this.getEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);
    
    return this.updateEvent(eventId, { status });
  }

  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<ScheduledEvent[]> {
    const response = await this.getEvents({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    return response.events;
  }
}
```

**Step 2.5.2**: Create remaining API implementations

**File**: `src/lib/api/implementations/mock/HelpersApi.ts` (CREATE NEW)

```typescript
import type { IHelpersApi, IApiContext } from '../../interfaces/index.js';
import type {
  HelperData,
  HelperAbsence,
  CheckHelperAvailabilityRequest,
  HelperAvailabilityResponse,
  CreateAbsenceRequest,
  Job,
  Role
} from '@ulti-project/shared';
import {
  getHelpersWithGuild,
  getHelperWithGuild,
  checkHelperAvailabilityWithGuild,
  createAbsenceWithGuild,
  getAbsencesWithGuild
} from '../../../mock/helpers.js';

export class MockHelpersApi implements IHelpersApi {
  constructor(public readonly context: IApiContext) {}

  async getHelpers(): Promise<HelperData[]> {
    return getHelpersWithGuild(this.context.guildId);
  }

  async getHelper(helperId: string): Promise<HelperData | null> {
    return getHelperWithGuild(this.context.guildId, helperId);
  }

  async checkHelperAvailability(request: CheckHelperAvailabilityRequest): Promise<HelperAvailabilityResponse> {
    return checkHelperAvailabilityWithGuild(this.context.guildId, request);
  }

  async getHelperAvailability(helperId: string, startDate: Date, endDate: Date): Promise<any[]> {
    // Implementation using existing helper availability logic
    const helper = await this.getHelper(helperId);
    return helper?.weeklyAvailability || [];
  }

  async createAbsence(helperId: string, absence: CreateAbsenceRequest): Promise<HelperAbsence> {
    return createAbsenceWithGuild(this.context.guildId, helperId, absence);
  }

  async getAbsences(helperId: string, startDate?: Date, endDate?: Date): Promise<HelperAbsence[]> {
    return getAbsencesWithGuild(this.context.guildId, helperId, startDate, endDate);
  }

  async deleteAbsence(helperId: string, absenceId: string): Promise<void> {
    // Implementation for absence deletion
    const storageKey = `helper_absences_${helperId}`;
    const absences = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    const filtered = absences.filter((a: any) => a.id !== absenceId);
    sessionStorage.setItem(storageKey, JSON.stringify(filtered));
  }

  async getHelpersByJobRole(jobs?: Job[], roles?: Role[]): Promise<HelperData[]> {
    const helpers = await this.getHelpers();
    return helpers.filter(helper => {
      if (jobs && !jobs.includes(helper.job)) return false;
      if (roles && !roles.includes(helper.role)) return false;
      return true;
    });
  }
}
```

**Step 2.5.3**: Create main mock implementation factory

**File**: `src/lib/api/implementations/mock/index.ts` (CREATE NEW)

```typescript
import type { ISchedulingApi, IApiContext } from '../../interfaces/index.js';
import { MockEventsApi } from './EventsApi.js';
import { MockHelpersApi } from './HelpersApi.js';
import { MockRosterApi } from './RosterApi.js';
import { MockLocksApi } from './LocksApi.js';

export class MockSchedulingApi implements ISchedulingApi {
  public readonly events: MockEventsApi;
  public readonly helpers: MockHelpersApi;
  public readonly roster: MockRosterApi;
  public readonly locks: MockLocksApi;

  constructor(context: IApiContext) {
    this.events = new MockEventsApi(context);
    this.helpers = new MockHelpersApi(context);
    this.roster = new MockRosterApi(context);
    this.locks = new MockLocksApi(context);
  }
}

export function createMockSchedulingApi(context: IApiContext): ISchedulingApi {
  return new MockSchedulingApi(context);
}
```

### Acceptance Criteria

- [ ] All interface implementations created
- [ ] Mock wrapper classes implement interfaces correctly
- [ ] Enhanced mock functions properly called
- [ ] Factory function exports main API
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] All existing mock functionality preserved

### Validation Commands

```bash
# Verify implementation files created
ls -la apps/website/src/lib/api/implementations/mock/

# Verify interface compliance
pnpm --filter website run type-check

# Verify factory exports
grep -n "createMockSchedulingApi" apps/website/src/lib/api/implementations/mock/index.ts
```

### File Operations

- **CREATE**: `src/lib/api/implementations/mock/EventsApi.ts`
- **CREATE**: `src/lib/api/implementations/mock/HelpersApi.ts`
- **CREATE**: `src/lib/api/implementations/mock/RosterApi.ts`
- **CREATE**: `src/lib/api/implementations/mock/LocksApi.ts`
- **CREATE**: `src/lib/api/implementations/mock/index.ts`

---

## Phase 2 Completion Validation

### Final Acceptance Criteria

- [ ] All 5 tasks completed successfully
- [ ] Enhanced mock functions preserve existing functionality
- [ ] Interface wrapper implementations created
- [ ] Guild parameter support added throughout
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] Existing SSE simulation continues working
- [ ] Session storage persistence maintained

### Final Validation Commands

```bash
# Comprehensive validation
pnpm --filter website run type-check
pnpm --filter website run build

# Verify enhanced mock functions
find apps/website/src/lib/mock -name "*.ts" -exec grep -l "WithGuild" {} \;

# Verify interface implementations
find apps/website/src/lib/api/implementations/mock -name "*.ts" | wc -l
```

### Files Created/Modified

**Modified Files:**

- `src/lib/mock/events.ts` - Added guild-aware functions
- `src/lib/mock/participants.ts` - Added unified participants function
- `src/lib/mock/helpers.ts` - Added guild and absence functions  
- `src/lib/mock/drafts.ts` - Added guild-aware lock functions

**New Files:**

- `src/lib/api/implementations/mock/EventsApi.ts`
- `src/lib/api/implementations/mock/HelpersApi.ts`
- `src/lib/api/implementations/mock/RosterApi.ts`
- `src/lib/api/implementations/mock/LocksApi.ts`
- `src/lib/api/implementations/mock/index.ts`

### Ready for Phase 3

Enhanced mock system now ready for Phase 3 HTTP implementation creation.

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

### Enhancement Strategy

Instead of creating new classes, we'll:

1. **Enhance Existing Functions**: Add `guildId` parameters to existing mock functions
2. **Add Missing Methods**: Implement functions needed for API specification compliance
3. **Create Interface Wrappers**: Lightweight classes that wrap enhanced functions
4. **Preserve All Logic**: Keep existing SSE simulation, data generation, and conflict handling

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
- **MUST** maintain backward compatibility with existing function calls

### Data Consistency Requirements

- **MUST** maintain relational integrity between entities
- **MUST** preserve cross-entity validation logic
- **MUST** maintain realistic helper availability patterns

## Implementation Tasks

### Task 2.1: Enhance Existing Mock Functions

#### Update `lib/mock/events.ts`

**Add Guild Parameter Support**:

```typescript
// Update existing function signatures
export async function createEvent(
  guildId: string, 
  request: CreateEventRequest
): Promise<ScheduledEvent> {
  // Use guildId for validation and context
  // ...existing logic preserved...
}

export async function getEvents(
  guildId: string, 
  filters?: EventFilters
): Promise<{ events: ScheduledEvent[]; total: number; hasMore: boolean }> {
  // Enhanced return type with pagination metadata
  const events = await getEventsLegacy(filters); // Call existing logic
  return {
    events,
    total: events.length,
    hasMore: false // Simplified for mock
  };
}

// Keep existing function for backward compatibility
async function getEventsLegacy(filters?: EventFilters): Promise<ScheduledEvent[]> {
  // ...existing implementation unchanged...
}
```

#### Update `lib/mock/participants.ts`

**Add Unified Participants Method**:

```typescript
// Add new unified method
export async function getParticipants(
  guildId: string,
  filters?: { encounter?: string; type?: 'helper' | 'progger' }
): Promise<Participant[]> {
  // Combine existing getProggers and getAllParticipants logic
  if (filters?.type === 'helper') {
    const { getHelpers } = await import('./helpers.js');
    const helpers = await getHelpers();
    return helpers.map(helper => ({ ...helper, type: 'helper' as const }));
  }
  
  if (filters?.type === 'progger') {
    return getProggers(filters);
  }
  
  // Return both types
  return getAllParticipants(filters);
}

// Update existing functions to accept guildId (optional for compatibility)
export async function getProggers(
  filters?: { encounter?: string; role?: string; job?: string },
  guildId?: string
): Promise<Participant[]> {
  // ...existing logic unchanged...
}
```

#### Update `lib/mock/helpers.ts`

**Add Missing Helper Management Methods**:

```typescript
// Add new methods to match API specification
export async function createHelperAbsence(
  guildId: string,
  helperId: string,
  absence: CreateHelperAbsenceRequest
): Promise<HelperAbsence> {
  await delay(MOCK_CONFIG.delays.medium);
  
  // Implementation using existing absence logic
  const newAbsence: HelperAbsence = {
    id: `absence-${Date.now()}`,
    helperId,
    startDate: absence.startDate,
    endDate: absence.endDate,
    reason: absence.reason || 'Personal',
    createdAt: new Date()
  };
  
  // Use existing absence storage logic
  // ...existing implementation...
  
  return newAbsence;
}

export async function updateHelperWeeklyAvailability(
  guildId: string,
  helperId: string,
  availability: HelperWeeklyAvailability[]
): Promise<HelperData> {
  // Implementation using existing helper logic
  const helper = await getHelper(helperId);
  if (!helper) throw new Error('Helper not found');
  
  const updatedHelper = {
    ...helper,
    weeklyAvailability: availability
  };
  
  // Update in storage using existing logic
  // ...existing implementation...
  
  return updatedHelper;
}

// Update existing functions to accept guildId
export async function getHelpers(guildId?: string): Promise<HelperData[]> {
  // Filter by guildId if provided, otherwise use default
  // ...existing logic with guild filtering...
}
```

#### Update `lib/mock/drafts.ts`

**Update Lock Management**:

```typescript
// Update existing functions to match API specification
export async function releaseLock(
  guildId: string,
  eventId: string,
  participantType: 'helper' | 'progger',
  participantId: string,
  teamLeaderId: string
): Promise<void> {
  // Use existing lock release logic but with participant-based parameters
  // ...existing implementation adapted...
}

export async function releaseAllTeamLeaderLocks(
  guildId: string,
  eventId: string,
  teamLeaderId: string
): Promise<void> {
  // Implementation using existing releaseAllLocksForTeamLeader logic
  return releaseAllLocksForTeamLeader(eventId, teamLeaderId);
}

// Update existing functions to accept guildId
export async function lockParticipant(
  guildId: string, // Added parameter
  eventId: string,
  teamLeaderId: string,
  request: { participantId: string; participantType: 'helper' | 'progger'; slotId?: string }
): Promise<DraftLock> {
  // Convert to existing LockParticipantRequest format
  const legacyRequest: LockParticipantRequest = {
    participantId: request.participantId,
    participantType: request.participantType as ParticipantType,
    slotId: request.slotId
  };
  
  // Call existing implementation
  return lockParticipantLegacy(eventId, teamLeaderId, legacyRequest);
}

// Rename existing function for backward compatibility
async function lockParticipantLegacy(
  eventId: string,
  teamLeaderId: string,
  request: LockParticipantRequest
): Promise<DraftLock> {
  // ...existing implementation unchanged...
}
```

### Task 2.2: Create Interface Wrapper Classes

After enhancing the existing mock functions, create lightweight wrapper classes that implement the interfaces:
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
        scheduledTime: new Date(Date.now() + 24 *60* 60 *1000),
        duration: 120,
        teamLeaderId: 'leader-1',
        teamLeaderName: 'TeamAlpha',
        status: EventStatus.Draft,
        roster: this.createPartiallyFilledRoster(),
        createdAt: new Date(Date.now() - 60* 60 *1000),
        lastModified: new Date(Date.now() - 30* 60 * 1000),
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

- [ ] **Existing mock functions enhanced** with `guildId` parameters and API specification compliance
- [ ] **Missing API methods added** to existing mock files (`getParticipants`, `createHelperAbsence`, etc.)
- [ ] **Backward compatibility maintained** for existing function calls
- [ ] All interface wrapper classes created and implement Phase 1 interfaces correctly
- [ ] Mock implementation factory created (`createMockApiClient`)
- [ ] All classes use types from `@ulti-project/shared` package only
- [ ] No local type definitions exist
- [ ] **Existing SSE simulation preserved** and functional
- [ ] **Session storage persistence maintained** for events
- [ ] **Realistic data and conflict handling preserved**
- [ ] **Lock timeout behavior (30 minutes) maintained**
- [ ] **Helper availability logic preserved** and enhanced
- [ ] All method signatures match interface contracts exactly
- [ ] TypeScript compilation succeeds without errors

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
