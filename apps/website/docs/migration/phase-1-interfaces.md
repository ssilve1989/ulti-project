# Phase 1: API Interface Layer

## Overview

**Duration**: 2-3 da## 🔄 Implementation Tasks

### Migration Strategy: Evolutionary Approach

**Key Insight**: The existing mock implementation is already sophisticated and guild-aware. Instead of rebuilding, we'll evolve and enhance it.

**Benefits**:

- Preserve existing SSE simulation and realistic data
- Minimize regression risk
- Faster implementation with proven mock logic
- Maintain backward compatibility naturally

### Task Overview

Phase 1 is broken down into **6 granular tasks** that must be completed sequentially:

1. **Task 1.1**: Create base interface infrastructure
2. **Task 1.2**: Define Events API interface
3. **Task 1.3**: Define Helpers API interface  
4. **Task 1.4**: Define Roster API interface
5. **Task 1.5**: Define Locks API interface
6. **Task 1.6**: Create API factory pattern

Each task has specific inputs, outputs, and acceptance criteria for AI agent execution.

---

## Task 1.1: Create Base Interface Infrastructure

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: None

### Inputs

- API specification from `@ulti-project/shared` package
- Current `schedulingApi.ts` function signatures for reference

### Outputs

- `src/lib/api/interfaces/base.ts` - Base interface definitions
- `src/lib/api/interfaces/index.ts` - Interface exports

### Implementation

**Step 1.1.1**: Create base interface file

**File**: `src/lib/api/interfaces/base.ts` (CREATE NEW)

```typescript
import type { ScheduledEvent, HelperData, Participant, DraftLock } from '@ulti-project/shared';

/**
 * Base context interface that all API implementations must support
 * Provides guild-scoped operations for multi-tenant architecture
 */
export interface IApiContext {
  readonly guildId: string;
}

/**
 * Base interface for all API implementations
 * Ensures consistent guild context across all operations
 */
export interface IBaseApi {
  readonly context: IApiContext;
}

/**
 * Configuration for API implementation selection
 */
export interface IApiConfig {
  readonly useMockData: boolean;
  readonly apiBaseUrl?: string;
  readonly defaultGuildId: string;
}

/**
 * Factory function signature for creating API implementations
 */
export type ApiFactory<T extends IBaseApi> = (context: IApiContext) => T;

/**
 * Standard paginated response structure
 */
export interface IPaginatedResponse<T> {
  readonly data: T[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}
```

**Step 1.1.2**: Create interface index file

**File**: `src/lib/api/interfaces/index.ts` (CREATE NEW)

```typescript
// Base interfaces
export type { 
  IApiContext, 
  IBaseApi, 
  IApiConfig, 
  ApiFactory,
  IPaginatedResponse 
} from './base.js';

// Domain interfaces (will be added in subsequent tasks)
export type { IEventsApi } from './events.js';
export type { IHelpersApi } from './helpers.js';
export type { IRosterApi } from './roster.js';
export type { ILocksApi } from './locks.js';
```

### Acceptance Criteria

- [ ] Base interface file created with all required interfaces
- [ ] Index file created with proper exports
- [ ] All types imported from `@ulti-project/shared` package only
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`

### Validation Commands

```bash
# Verify TypeScript compilation
pnpm --filter website run type-check

# Verify linting
pnpm --filter website run lint

# Verify file structure
ls -la apps/website/src/lib/api/interfaces/
```

### File Operations

- **CREATE**: `src/lib/api/interfaces/base.ts`
- **CREATE**: `src/lib/api/interfaces/index.ts`
- **NO CHANGES**: All existing files remain unchanged

---

## Task 1.2: Define Events API Interface

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 1.1 (base interfaces)

### Inputs

- Task 1.1 outputs (base interfaces)
- Current `schedulingApi.ts` event functions for reference
- `@ulti-project/shared` event types

### Outputs

- `src/lib/api/interfaces/events.ts` - Events API interface definition

### Implementation

**Step 1.2.1**: Create events interface file

**File**: `src/lib/api/interfaces/events.ts` (CREATE NEW)

```typescript
import type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  EventStatus
} from '@ulti-project/shared';
import type { IBaseApi, IPaginatedResponse } from './base.js';

/**
 * Events API interface defining all event management operations
 * All methods require guild context for multi-tenant support
 */
export interface IEventsApi extends IBaseApi {
  /**
   * Create a new event in the specified guild
   */
  createEvent(request: CreateEventRequest): Promise<ScheduledEvent>;

  /**
   * Get a specific event by ID
   */
  getEvent(eventId: string): Promise<ScheduledEvent | null>;

  /**
   * Get events with optional filtering and pagination
   */
  getEvents(filters?: EventFilters): Promise<IPaginatedResponse<ScheduledEvent>>;

  /**
   * Update an existing event
   */
  updateEvent(eventId: string, updates: UpdateEventRequest): Promise<ScheduledEvent>;

  /**
   * Delete an event (requires team leader permission)
   */
  deleteEvent(eventId: string, teamLeaderId: string): Promise<void>;

  /**
   * Update event status
   */
  updateEventStatus(eventId: string, status: EventStatus): Promise<ScheduledEvent>;

  /**
   * Get events by date range
   */
  getEventsByDateRange(startDate: Date, endDate: Date): Promise<ScheduledEvent[]>;
}
```

**Step 1.2.2**: Update interface index exports

**File**: `src/lib/api/interfaces/index.ts` (MODIFY)

```typescript
// Base interfaces
export type { 
  IApiContext, 
  IBaseApi, 
  IApiConfig, 
  ApiFactory,
  IPaginatedResponse 
} from './base.js';

// Domain interfaces
export type { IEventsApi } from './events.js';
// Export placeholders for remaining interfaces (will be implemented in subsequent tasks)
// export type { IHelpersApi } from './helpers.js';
// export type { IRosterApi } from './roster.js';
// export type { ILocksApi } from './locks.js';
```

### Acceptance Criteria

- [ ] Events interface file created with all required methods
- [ ] All method signatures match API specification requirements
- [ ] Guild context handled through `IBaseApi.context`
- [ ] All types imported from `@ulti-project/shared` package only
- [ ] Interface exports updated in index file
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`

### Validation Commands

```bash
# Verify TypeScript compilation
pnpm --filter website run type-check

# Verify interface structure
grep -n "interface IEventsApi" apps/website/src/lib/api/interfaces/events.ts

# Verify proper imports
grep -n "@ulti-project/shared" apps/website/src/lib/api/interfaces/events.ts
```

### File Operations

- **CREATE**: `src/lib/api/interfaces/events.ts`
- **MODIFY**: `src/lib/api/interfaces/index.ts` (add events export)
- **NO CHANGES**: All other files remain unchanged

---

## Task 1.3: Define Helpers API Interface

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 1.2 (events interface complete)

### Inputs

- Task 1.2 outputs (events interface)
- Current `schedulingApi.ts` helper functions for reference
- `@ulti-project/shared` helper types

### Outputs

- `src/lib/api/interfaces/helpers.ts` - Helpers API interface definition

### Implementation

**Step 1.3.1**: Create helpers interface file

**File**: `src/lib/api/interfaces/helpers.ts` (CREATE NEW)

```typescript
import type {
  HelperData,
  HelperAbsence,
  HelperWeeklyAvailability,
  CheckHelperAvailabilityRequest,
  HelperAvailabilityResponse,
  CreateAbsenceRequest,
  Job,
  Role
} from '@ulti-project/shared';
import type { IBaseApi, IPaginatedResponse } from './base.js';

/**
 * Helpers API interface defining all helper management operations
 * Includes availability checking, absence management, and helper data retrieval
 */
export interface IHelpersApi extends IBaseApi {
  /**
   * Get all helpers for the guild
   */
  getHelpers(): Promise<HelperData[]>;

  /**
   * Get a specific helper by ID
   */
  getHelper(helperId: string): Promise<HelperData | null>;

  /**
   * Check if a helper is available for a specific time slot
   */
  checkHelperAvailability(request: CheckHelperAvailabilityRequest): Promise<HelperAvailabilityResponse>;

  /**
   * Get helper availability for a date range
   */
  getHelperAvailability(
    helperId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<HelperWeeklyAvailability[]>;

  /**
   * Create a helper absence
   */
  createAbsence(helperId: string, absence: CreateAbsenceRequest): Promise<HelperAbsence>;

  /**
   * Get helper absences for a date range
   */
  getAbsences(
    helperId: string, 
    startDate?: Date, 
    endDate?: Date
  ): Promise<HelperAbsence[]>;

  /**
   * Delete a helper absence
   */
  deleteAbsence(helperId: string, absenceId: string): Promise<void>;

  /**
   * Get helpers by job/role filters
   */
  getHelpersByJobRole(jobs?: Job[], roles?: Role[]): Promise<HelperData[]>;
}
```

**Step 1.3.2**: Update interface index exports

**File**: `src/lib/api/interfaces/index.ts` (MODIFY)

```typescript
// Base interfaces
export type { 
  IApiContext, 
  IBaseApi, 
  IApiConfig, 
  ApiFactory,
  IPaginatedResponse 
} from './base.js';

// Domain interfaces
export type { IEventsApi } from './events.js';
export type { IHelpersApi } from './helpers.js';
// Export placeholders for remaining interfaces
// export type { IRosterApi } from './roster.js';
// export type { ILocksApi } from './locks.js';
```

### Acceptance Criteria

- [ ] Helpers interface file created with all required methods
- [ ] All method signatures support helper availability and absence management
- [ ] Guild context handled through `IBaseApi.context`
- [ ] All types imported from `@ulti-project/shared` package only
- [ ] Interface exports updated in index file
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`

### Validation Commands

```bash
# Verify TypeScript compilation
pnpm --filter website run type-check

# Verify interface structure
grep -n "interface IHelpersApi" apps/website/src/lib/api/interfaces/helpers.ts

# Verify proper imports
grep -n "@ulti-project/shared" apps/website/src/lib/api/interfaces/helpers.ts
```

### File Operations

- **CREATE**: `src/lib/api/interfaces/helpers.ts`
- **MODIFY**: `src/lib/api/interfaces/index.ts` (add helpers export)
- **NO CHANGES**: All other files remain unchanged

---

## Task 1.4: Define Roster API Interface

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 1.3 (helpers interface complete)

### Inputs

- Task 1.3 outputs (helpers interface)
- Current `schedulingApi.ts` participant functions for reference
- `@ulti-project/shared` roster and participant types

### Outputs

- `src/lib/api/interfaces/roster.ts` - Roster API interface definition

### Implementation

**Step 1.4.1**: Create roster interface file

**File**: `src/lib/api/interfaces/roster.ts` (CREATE NEW)

```typescript
import type {
  Participant,
  ParticipantType,
  AssignParticipantRequest,
  UnassignParticipantRequest,
  EventRoster,
  PartySlot,
  Job,
  Role
} from '@ulti-project/shared';
import type { IBaseApi } from './base.js';

/**
 * Roster API interface defining all roster and participant management operations
 * Handles participant assignment, party composition, and roster validation
 */
export interface IRosterApi extends IBaseApi {
  /**
   * Get all participants (helpers and proggers) with optional filtering
   */
  getParticipants(filters?: {
    encounter?: string;
    type?: ParticipantType;
    role?: Role;
    job?: Job;
  }): Promise<Participant[]>;

  /**
   * Get participants specifically for an event
   */
  getEventParticipants(eventId: string): Promise<Participant[]>;

  /**
   * Assign a participant to an event roster slot
   */
  assignParticipant(eventId: string, request: AssignParticipantRequest): Promise<EventRoster>;

  /**
   * Unassign a participant from an event roster slot
   */
  unassignParticipant(eventId: string, request: UnassignParticipantRequest): Promise<EventRoster>;

  /**
   * Get the complete roster for an event
   */
  getEventRoster(eventId: string): Promise<EventRoster>;

  /**
   * Validate party composition for an event
   */
  validatePartyComposition(eventId: string): Promise<{
    isValid: boolean;
    violations: string[];
    suggestions: string[];
  }>;

  /**
   * Get available participants for a specific event slot
   */
  getAvailableParticipants(
    eventId: string, 
    slotType: Role, 
    preferredJob?: Job
  ): Promise<Participant[]>;

  /**
   * Swap participants between two roster slots
   */
  swapParticipants(
    eventId: string, 
    participant1Id: string, 
    participant2Id: string
  ): Promise<EventRoster>;
}
```

**Step 1.4.2**: Update interface index exports

**File**: `src/lib/api/interfaces/index.ts` (MODIFY)

```typescript
// Base interfaces
export type { 
  IApiContext, 
  IBaseApi, 
  IApiConfig, 
  ApiFactory,
  IPaginatedResponse 
} from './base.js';

// Domain interfaces
export type { IEventsApi } from './events.js';
export type { IHelpersApi } from './helpers.js';
export type { IRosterApi } from './roster.js';
// Export placeholder for remaining interface
// export type { ILocksApi } from './locks.js';
```

### Acceptance Criteria

- [ ] Roster interface file created with all required methods
- [ ] All method signatures support participant management and roster operations
- [ ] Guild context handled through `IBaseApi.context`
- [ ] All types imported from `@ulti-project/shared` package only
- [ ] Interface exports updated in index file
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`

### Validation Commands

```bash
# Verify TypeScript compilation
pnpm --filter website run type-check

# Verify interface structure
grep -n "interface IRosterApi" apps/website/src/lib/api/interfaces/roster.ts

# Verify proper imports
grep -n "@ulti-project/shared" apps/website/src/lib/api/interfaces/roster.ts
```

### File Operations

- **CREATE**: `src/lib/api/interfaces/roster.ts`
- **MODIFY**: `src/lib/api/interfaces/index.ts` (add roster export)
- **NO CHANGES**: All other files remain unchanged

---

## Task 1.5: Define Locks API Interface

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 1.4 (roster interface complete)

### Inputs

- Task 1.4 outputs (roster interface)
- Current `schedulingApi.ts` lock functions for reference
- `@ulti-project/shared` lock types

### Outputs

- `src/lib/api/interfaces/locks.ts` - Locks API interface definition

### Implementation

**Step 1.5.1**: Create locks interface file

**File**: `src/lib/api/interfaces/locks.ts` (CREATE NEW)

```typescript
import type {
  DraftLock,
  LockParticipantRequest,
  ReleaseLockRequest
} from '@ulti-project/shared';
import type { IBaseApi } from './base.js';

/**
 * Locks API interface defining all draft lock management operations
 * Handles participant locking to prevent concurrent roster editing
 */
export interface ILocksApi extends IBaseApi {
  /**
   * Lock a participant for draft editing
   */
  lockParticipant(eventId: string, request: LockParticipantRequest): Promise<DraftLock>;

  /**
   * Release a participant lock
   */
  releaseLock(eventId: string, request: ReleaseLockRequest): Promise<void>;

  /**
   * Get all active locks for an event
   */
  getActiveLocks(eventId: string): Promise<DraftLock[]>;

  /**
   * Get locks held by a specific team leader
   */
  getLocksForTeamLeader(eventId: string, teamLeaderId: string): Promise<DraftLock[]>;

  /**
   * Release all locks for a team leader (cleanup on disconnect)
   */
  releaseAllLocks(eventId: string, teamLeaderId: string): Promise<void>;

  /**
   * Check if a participant is currently locked
   */
  isParticipantLocked(eventId: string, participantId: string): Promise<{
    isLocked: boolean;
    lockInfo?: DraftLock;
  }>;

  /**
   * Extend lock duration (refresh timeout)
   */
  extendLock(eventId: string, lockId: string): Promise<DraftLock>;
}
```

**Step 1.5.2**: Update interface index exports

**File**: `src/lib/api/interfaces/index.ts` (MODIFY)

```typescript
// Base interfaces
export type { 
  IApiContext, 
  IBaseApi, 
  IApiConfig, 
  ApiFactory,
  IPaginatedResponse 
} from './base.js';

// Domain interfaces
export type { IEventsApi } from './events.js';
export type { IHelpersApi } from './helpers.js';
export type { IRosterApi } from './roster.js';
export type { ILocksApi } from './locks.js';
```

### Acceptance Criteria

- [ ] Locks interface file created with all required methods
- [ ] All method signatures support draft lock management
- [ ] Guild context handled through `IBaseApi.context`
- [ ] All types imported from `@ulti-project/shared` package only
- [ ] Interface exports updated in index file
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`

### Validation Commands

```bash
# Verify TypeScript compilation
pnpm --filter website run type-check

# Verify interface structure
grep -n "interface ILocksApi" apps/website/src/lib/api/interfaces/locks.ts

# Verify proper imports
grep -n "@ulti-project/shared" apps/website/src/lib/api/interfaces/locks.ts
```

### File Operations

- **CREATE**: `src/lib/api/interfaces/locks.ts`
- **MODIFY**: `src/lib/api/interfaces/index.ts` (add locks export)
- **NO CHANGES**: All other files remain unchanged

---

## Task 1.6: Create API Factory Pattern

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 1.5 (all interfaces complete)

### Inputs

- All interface definitions from Tasks 1.1-1.5
- Current `schedulingApi.ts` implementation pattern
- Environment configuration requirements

### Outputs

- `src/lib/api/factory.ts` - API factory implementation
- `src/lib/api/index.ts` - Main API exports

### Implementation

**Step 1.6.1**: Create API factory file

**File**: `src/lib/api/factory.ts` (CREATE NEW)

```typescript
import type { 
  IApiContext, 
  IApiConfig, 
  IEventsApi, 
  IHelpersApi, 
  IRosterApi, 
  ILocksApi,
  ApiFactory 
} from './interfaces/index.js';

/**
 * Combined API interface that includes all domain APIs
 */
export interface ISchedulingApi {
  readonly events: IEventsApi;
  readonly helpers: IHelpersApi;
  readonly roster: IRosterApi;
  readonly locks: ILocksApi;
}

/**
 * API factory that creates the appropriate implementation based on configuration
 */
export class ApiFactory {
  private static instance: ApiFactory | null = null;
  private config: IApiConfig;

  private constructor(config: IApiConfig) {
    this.config = config;
  }

  /**
   * Get or create the singleton factory instance
   */
  static getInstance(config?: IApiConfig): ApiFactory {
    if (!ApiFactory.instance) {
      if (!config) {
        throw new Error('ApiFactory requires initial configuration');
      }
      ApiFactory.instance = new ApiFactory(config);
    }
    return ApiFactory.instance;
  }

  /**
   * Create a scheduling API instance for the specified guild
   */
  createSchedulingApi(guildId?: string): ISchedulingApi {
    const context: IApiContext = {
      guildId: guildId || this.config.defaultGuildId
    };

    if (this.config.useMockData) {
      return this.createMockApi(context);
    } else {
      return this.createHttpApi(context);
    }
  }

  /**
   * Create mock implementation (to be implemented in Phase 2)
   */
  private createMockApi(context: IApiContext): ISchedulingApi {
    // Placeholder - will be implemented in Phase 2
    throw new Error('Mock API implementation not yet available - implement in Phase 2');
  }

  /**
   * Create HTTP implementation (to be implemented in Phase 3)
   */
  private createHttpApi(context: IApiContext): ISchedulingApi {
    // Placeholder - will be implemented in Phase 3
    throw new Error('HTTP API implementation not yet available - implement in Phase 3');
  }

  /**
   * Update factory configuration
   */
  updateConfig(config: Partial<IApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): IApiConfig {
    return { ...this.config };
  }
}

/**
 * Default configuration based on environment
 */
export const createDefaultConfig = (): IApiConfig => ({
  useMockData: process.env.NODE_ENV === 'development' || process.env.USE_MOCK_DATA === 'true',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  defaultGuildId: process.env.DEFAULT_GUILD_ID || 'default-guild'
});
```

**Step 1.6.2**: Create main API index file

**File**: `src/lib/api/index.ts` (CREATE NEW)

```typescript
// Export all interfaces
export type {
  IApiContext,
  IApiConfig,
  IEventsApi,
  IHelpersApi,
  IRosterApi,
  ILocksApi,
  IPaginatedResponse,
  ApiFactory as ApiFactoryType
} from './interfaces/index.js';

// Export factory and main API interface
export type { ISchedulingApi } from './factory.js';
export { ApiFactory, createDefaultConfig } from './factory.js';

// Convenience function for creating API instances
export const createSchedulingApi = (guildId?: string) => {
  const config = createDefaultConfig();
  const factory = ApiFactory.getInstance(config);
  return factory.createSchedulingApi(guildId);
};
```

### Acceptance Criteria

- [ ] API factory file created with singleton pattern
- [ ] Factory supports both mock and HTTP implementations
- [ ] Configuration management implemented
- [ ] Main API index exports all required types and functions
- [ ] Environment-based default configuration
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`

### Validation Commands

```bash
# Verify TypeScript compilation
pnpm --filter website run type-check

# Verify factory structure
grep -n "class ApiFactory" apps/website/src/lib/api/factory.ts

# Verify all exports
grep -n "export" apps/website/src/lib/api/index.ts
```

### File Operations

- **CREATE**: `src/lib/api/factory.ts`
- **CREATE**: `src/lib/api/index.ts`
- **NO CHANGES**: All other files remain unchanged

---

## Phase 1 Completion Validation

### Final Acceptance Criteria

- [ ] All 6 tasks completed successfully
- [ ] All interface files created and properly exported
- [ ] API factory pattern implemented with singleton
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No ESLint errors: `pnpm --filter website run lint`
- [ ] All imports use `@ulti-project/shared` package only
- [ ] Guild context properly handled in all interfaces

### Final Validation Commands

```bash
# Comprehensive validation
pnpm --filter website run type-check
pnpm --filter website run lint
pnpm --filter website run build

# Verify file structure
find apps/website/src/lib/api -type f -name "*.ts" | sort

# Verify no local type definitions
grep -r "interface.*Request\|interface.*Response" apps/website/src/lib/api/interfaces/ || echo "No local types found - Good!"
```

### Files Created

- `src/lib/api/interfaces/base.ts`
- `src/lib/api/interfaces/events.ts`
- `src/lib/api/interfaces/helpers.ts`
- `src/lib/api/interfaces/roster.ts`
- `src/lib/api/interfaces/locks.ts`
- `src/lib/api/interfaces/index.ts`
- `src/lib/api/factory.ts`
- `src/lib/api/index.ts`

### Ready for Phase 2

Upon completion, the following will be available for Phase 2:

- Complete interface definitions for all API domains
- Factory pattern ready for mock and HTTP implementations
- Guild context support in all interfaces
- Type-safe contracts using shared package types

### Type Safety Requirements

- **Strict Type Imports**: All types must be imported from `@ulti-project/shared` package
- **No Local Definitions**: No interface or type definitions are allowed in the website package  
- **Import Pattern**: Use `import type { ... } from '@ulti-project/shared'`
- **Runtime Safety**: TypeScript provides compile-time safety - no runtime type validation needed

### Interface Architecture

The new API interface architecture provides:

- **Guild Context**: All operations include guild ID for multi-tenancy
- **Dependency Injection**: Factory pattern for mock/HTTP switching  
- **Type Safety**: Strict TypeScript interfaces with shared types
- **Extensibility**: Easy to add new domains and operations

## Dependencies

### Required Files

**Input Files:**

- `apps/website/src/lib/schedulingApi.ts` - Current API function signatures
- `apps/website/src/lib/mock/*` - Existing mock implementations to preserve
- `@ulti-project/shared` package - All type definitions

**No Dependencies:** Phase 1 can be implemented independently

### Next Phase Requirements

Upon completion, Phase 2 will require:

- All interface definitions from this phase
- Factory pattern implementation
- Guild context infrastructure
- Type-safe contracts for mock implementation enhancement

## 🎯 Phase 1 Success Criteria

### Completion Validation

**All tasks 1.1-1.6 must be completed with:**

- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] No lint errors: `pnpm --filter website run lint`
- [ ] All interfaces use shared package types only
- [ ] Factory pattern supports both mock and HTTP implementations
- [ ] Guild context properly implemented in all interfaces
- [ ] Development environment ready for Phase 2

### Quality Gates

**Before proceeding to Phase 2:**

1. **Interface Completeness**: All API domains have complete interfaces
2. **Type Safety**: Zero local type definitions, all imports from shared package
3. **Architecture**: Factory pattern ready for implementation registration
4. **Documentation**: Clear contracts for Phase 2 implementation

### Files Delivered

**New Files Created:**

- `src/lib/api/interfaces/base.ts`
- `src/lib/api/interfaces/events.ts`
- `src/lib/api/interfaces/helpers.ts`
- `src/lib/api/interfaces/roster.ts`
- `src/lib/api/interfaces/locks.ts`
- `src/lib/api/interfaces/index.ts`
- `src/lib/api/factory.ts`
- `src/lib/api/index.ts`

**Existing Files:** No modifications - all existing functionality preserved

This establishes the foundation for the evolutionary migration approach, enabling Phase 2 to enhance existing mock implementations while maintaining all sophisticated features.
