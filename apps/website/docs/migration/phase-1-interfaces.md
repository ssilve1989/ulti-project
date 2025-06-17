# Phase 1: API Interface Layer

## Overview

**Duration**: 2-3 days  
**Complexity**: Medium  
**Goal**: Create abstract TypeScript interfaces and dependency injection infrastructure

This phase establishes the foundation for the entire migration by defining clean contracts for each API domain and setting up the dependency injection system.

## Current State

### Existing Files to Reference

- `apps/website/src/lib/schedulingApi.ts` - Current API layer with function exports
- `apps/website/src/lib/mock/*` - Existing mock implementations
- `@ulti-project/shared` - Type definitions and schemas

### Current Function Signatures

The existing `schedulingApi.ts` exports these functions that need interface equivalents:

```typescript
// Event Management
export async function createEvent(request: CreateEventRequest): Promise<ScheduledEvent>
export async function getEvent(id: string): Promise<ScheduledEvent | null>
export async function getEvents(filters?: EventFilters): Promise<ScheduledEvent[]>
export async function updateEvent(id: string, updates: UpdateEventRequest): Promise<ScheduledEvent>
export async function deleteEvent(id: string, teamLeaderId: string): Promise<void>

// Helper Management
export async function getHelpers(): Promise<HelperData[]>
export async function isHelperAvailableForEvent(helperId: string, eventStart: Date, eventEnd: Date): Promise<{available: boolean; reason?: string}>

// Participant Management
export async function getProggers(filters?: {encounter?: string; role?: string; job?: string}): Promise<Participant[]>
export async function getAllParticipants(filters?: {encounter?: string; role?: string; type?: 'helper' | 'progger'}): Promise<Participant[]>

// Lock Management
export async function lockParticipant(eventId: string, teamLeaderId: string, request: LockParticipantRequest): Promise<DraftLock>
export async function releaseLock(eventId: string, teamLeaderId: string, lockId: string): Promise<void>
export async function getActiveLocks(eventId: string): Promise<DraftLock[]>

// Roster Management
export async function assignParticipant(eventId: string, teamLeaderId: string, request: AssignParticipantRequest): Promise<ScheduledEvent>
export async function unassignParticipant(eventId: string, teamLeaderId: string, slotId: string): Promise<ScheduledEvent>

// SSE Management
export function createEventEventSource(eventId: string): EventSource
export function createDraftLocksEventSource(eventId: string): EventSource
export function createHelpersEventSource(): EventSource
```

## Requirements

### Type Safety Requirements

- **MUST** import all types from `@ulti-project/shared` package
- **NO** local type definitions allowed
- **MUST** maintain exact function signatures from current API
- TypeScript compiler must enforce interface conformance

### Interface Design Requirements

- Separate interfaces for each domain (Events, Helpers, Roster, Locks, SSE)
- Clean separation of concerns
- Identical method signatures to current functions
- Support for all existing functionality

## Implementation Tasks

### Task 1.1: Define Core API Interfaces

Create interface files with proper type imports:

#### File: `lib/api/interfaces/IEventsApi.ts`

```typescript
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
  deleteEvent(id: string, teamLeaderId: string): Promise<void>;
}
```

#### File: `lib/api/interfaces/IHelpersApi.ts`

```typescript
import type {
  HelperData
} from '@ulti-project/shared';

export interface IHelpersApi {
  getHelpers(): Promise<HelperData[]>;
  isHelperAvailableForEvent(
    helperId: string, 
    eventStart: Date, 
    eventEnd: Date
  ): Promise<{
    available: boolean; 
    reason?: 'absent' | 'outside_schedule' | 'available';
  }>;
}
```

#### File: `lib/api/interfaces/IRosterApi.ts`

```typescript
import type {
  ScheduledEvent,
  AssignParticipantRequest,
  Participant
} from '@ulti-project/shared';

export interface IRosterApi {
  assignParticipant(
    eventId: string, 
    teamLeaderId: string, 
    request: AssignParticipantRequest
  ): Promise<ScheduledEvent>;
  
  unassignParticipant(
    eventId: string, 
    teamLeaderId: string, 
    slotId: string
  ): Promise<ScheduledEvent>;
  
  getProggers(filters?: {
    encounter?: string; 
    role?: string; 
    job?: string;
  }): Promise<Participant[]>;
  
  getAllParticipants(filters?: {
    encounter?: string; 
    role?: string; 
    type?: 'helper' | 'progger';
  }): Promise<Participant[]>;
}
```

#### File: `lib/api/interfaces/ILocksApi.ts`

```typescript
import type {
  DraftLock,
  LockParticipantRequest
} from '@ulti-project/shared';

export interface ILocksApi {
  lockParticipant(
    eventId: string, 
    teamLeaderId: string, 
    request: LockParticipantRequest
  ): Promise<DraftLock>;
  
  releaseLock(
    eventId: string, 
    teamLeaderId: string, 
    lockId: string
  ): Promise<void>;
  
  getActiveLocks(eventId: string): Promise<DraftLock[]>;
}
```

#### File: `lib/api/interfaces/ISSEApi.ts`

```typescript
export interface ISSEApi {
  createEventEventSource(eventId: string): EventSource;
  createDraftLocksEventSource(eventId: string): EventSource;
  createHelpersEventSource(): EventSource;
}
```

#### File: `lib/api/interfaces/index.ts`

```typescript
export type { IEventsApi } from './IEventsApi.js';
export type { IHelpersApi } from './IHelpersApi.js';
export type { IRosterApi } from './IRosterApi.js';
export type { ILocksApi } from './ILocksApi.js';
export type { ISSEApi } from './ISSEApi.js';
```

### Task 1.2: Create API Client Interface

#### File: `lib/api/interfaces/IApiClient.ts`

```typescript
import type { IEventsApi } from './IEventsApi.js';
import type { IHelpersApi } from './IHelpersApi.js';
import type { IRosterApi } from './IRosterApi.js';
import type { ILocksApi } from './ILocksApi.js';
import type { ISSEApi } from './ISSEApi.js';

export interface IApiClient {
  events: IEventsApi;
  helpers: IHelpersApi;
  roster: IRosterApi;
  locks: ILocksApi;
  sse: ISSEApi;
}
```

### Task 1.3: Create Factory Pattern

#### File: `lib/api/factory.ts`

```typescript
import type { IApiClient } from './interfaces/IApiClient.js';

// Type definitions for implementations (will be created in Phase 2 & 3)
export interface ApiImplementations {
  mock: () => Promise<IApiClient>;
  http: () => Promise<IApiClient>;
}

// Environment configuration
interface ApiConfig {
  useMock: boolean;
  enableHotSwap: boolean;
  baseUrl?: string;
}

// Get configuration from environment
function getApiConfig(): ApiConfig {
  return {
    useMock: import.meta.env.VITE_USE_MOCK_API !== 'false', // Default to true
    enableHotSwap: import.meta.env.VITE_ENABLE_API_HOTSWAP === 'true',
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  };
}

// Singleton instance
let apiClientInstance: IApiClient | null = null;
let currentImplementation: 'mock' | 'http' | null = null;

// Factory function
export async function createApiClient(): Promise<IApiClient> {
  const config = getApiConfig();
  const implementationType = config.useMock ? 'mock' : 'http';
  
  // Return existing instance if implementation hasn't changed
  if (apiClientInstance && currentImplementation === implementationType) {
    return apiClientInstance;
  }
  
  // Create new instance based on configuration
  if (implementationType === 'mock') {
    // Dynamic import to enable tree-shaking in production
    const { createMockApiClient } = await import('./implementations/mock/index.js');
    apiClientInstance = await createMockApiClient();
  } else {
    // Dynamic import for HTTP implementation
    const { createHttpApiClient } = await import('./implementations/http/index.js');
    apiClientInstance = await createHttpApiClient(config.baseUrl!);
  }
  
  currentImplementation = implementationType;
  return apiClientInstance;
}

// Development controls for hot-swapping
export const developmentControls = import.meta.env.DEV ? {
  async setImplementation(type: 'mock' | 'http'): Promise<void> {
    const config = getApiConfig();
    if (!config.enableHotSwap) {
      throw new Error('Hot-swapping is disabled');
    }
    
    // Force recreation of client
    apiClientInstance = null;
    currentImplementation = null;
    
    // Override environment setting temporarily
    if (type === 'mock') {
      (import.meta.env as any).VITE_USE_MOCK_API = 'true';
    } else {
      (import.meta.env as any).VITE_USE_MOCK_API = 'false';
    }
    
    // Create new client with updated setting
    await createApiClient();
  },
  
  getCurrentImplementation(): 'mock' | 'http' | null {
    return currentImplementation;
  },
  
  getConfig(): ApiConfig {
    return getApiConfig();
  }
} : null;

// Make dev controls available globally in development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__ultiApiControls = developmentControls;
}
```

### Task 1.4: Create Environment Type Definitions

#### File: `lib/api/types/environment.d.ts`

```typescript
interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_ENABLE_API_HOTSWAP?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global development controls
declare global {
  interface Window {
    __ultiApiControls?: {
      setImplementation(type: 'mock' | 'http'): Promise<void>;
      getCurrentImplementation(): 'mock' | 'http' | null;
      getConfig(): {
        useMock: boolean;
        enableHotSwap: boolean;
        baseUrl?: string;
      };
    };
  }
}
```

## Validation Criteria

### Phase 1 Completion Checklist

- [ ] All interface files created with proper type imports
- [ ] Factory pattern implemented with environment detection
- [ ] Dependency injection container created and type-safe
- [ ] No local type definitions exist
- [ ] All imports are from `@ulti-project/shared`
- [ ] TypeScript compilation succeeds without errors
- [ ] Development controls are available in dev mode
- [ ] Environment variables are properly typed

### Testing Requirements

```typescript
// Create a simple test to validate interface contracts
// File: lib/api/__tests__/interfaces.test.ts

import type { IEventsApi, IHelpersApi, IRosterApi, ILocksApi, ISSEApi } from '../interfaces/index.js';
import type { CreateEventRequest, ScheduledEvent } from '@ulti-project/shared';

// Type-only tests to ensure interface conformance
describe('API Interfaces', () => {
  it('should have proper type contracts', () => {
    // This test ensures interfaces are properly typed
    const mockEventsApi: IEventsApi = {} as IEventsApi;
    
    // TypeScript will fail compilation if signatures don't match
    const createEventMethod: (request: CreateEventRequest) => Promise<ScheduledEvent> = 
      mockEventsApi.createEvent;
    
    expect(typeof createEventMethod).toBe('function');
  });
});
```

### Performance Requirements

- Factory function should use dynamic imports for tree-shaking
- Singleton pattern prevents unnecessary re-instantiation
- Development controls only available in development mode

## Dependencies

### Required Files

- Review `apps/website/src/lib/schedulingApi.ts` for current signatures
- Import types from `@ulti-project/shared` package
- No dependencies on other migration phases

### Next Phase Preparation

- Interfaces are ready for Phase 2 mock implementations
- Factory pattern is ready for implementation registration
- Development controls prepared for hot-swapping

## Risk Mitigation

### Type Safety Risks

- **Risk**: Interface signatures don't match current functions
- **Mitigation**: Copy exact signatures from `schedulingApi.ts`

### Environment Configuration Risks

- **Risk**: Environment variables not properly detected
- **Mitigation**: Provide sensible defaults and type definitions

### Backward Compatibility Risks

- **Risk**: Changes impact existing code
- **Mitigation**: This phase creates new files only, no existing code changes

This phase creates the foundation for type-safe API abstraction without affecting any existing functionality.
