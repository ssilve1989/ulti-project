# Phase 4: API Client Integration

**Duration**: 1 day  
**Complexity**: Medium  
**Dependencies**: Phases 1-3

## Overview

**Goal**: Create a unified API client that integrates mock and HTTP implementations with environment-based switching while maintaining backward compatibility.

**Strategy**: Build dependency-injected client that uses factory pattern from Phase 1 with implementations from Phases 2-3.

## 🔄 Implementation Tasks

### Task Overview

Phase 4 is broken down into **3 granular tasks** that must be completed sequentially:

1. **Task 4.1**: Update API factory with implementation selection
2. **Task 4.2**: Create unified client interface  
3. **Task 4.3**: Add backward compatibility layer

Each task builds toward a complete integrated solution.

---

## Task 4.1: Update API Factory with Implementation Selection

**Duration**: 30 minutes  
**Complexity**: Medium  
**Dependencies**: Phase 3 complete

### Inputs

- Phase 1 factory pattern
- Phase 2 mock implementations
- Phase 3 HTTP implementations
- Environment configuration requirements

### Outputs

- Updated factory with implementation selection
- Environment-based configuration
- Development controls for switching

### Implementation

**Step 4.1.1**: Update main API factory

**File**: `src/lib/api/factory.ts` (MODIFY existing)

```typescript
import type { ISchedulingApi, IApiContext, IApiConfig } from './interfaces/index.js';
import { createMockSchedulingApi } from './implementations/mock/index.js';
import { createHttpSchedulingApi } from './implementations/http/index.js';

export class ApiFactory {
  private static instance: ApiFactory | null = null;
  private config: IApiConfig;

  private constructor(config: IApiConfig) {
    this.config = config;
  }

  static getInstance(config?: IApiConfig): ApiFactory {
    if (!ApiFactory.instance) {
      if (!config) {
        throw new Error('ApiFactory requires initial configuration');
      }
      ApiFactory.instance = new ApiFactory(config);
    }
    return ApiFactory.instance;
  }

  createSchedulingApi(guildId?: string): ISchedulingApi {
    const context: IApiContext = {
      guildId: guildId || this.config.defaultGuildId
    };

    if (this.config.useMockData) {
      console.log('🎭 Using Mock API implementation');
      return createMockSchedulingApi(context);
    } else {
      console.log('🌐 Using HTTP API implementation');
      if (!this.config.apiBaseUrl) {
        throw new Error('API base URL required for HTTP implementation');
      }
      
      const token = import.meta.env.VITE_API_TOKEN;
      return createHttpSchedulingApi(this.config.apiBaseUrl, token, context);
    }
  }

  updateConfig(config: Partial<IApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): IApiConfig {
    return { ...this.config };
  }
}

export const createDefaultConfig = (): IApiConfig => ({
  useMockData: import.meta.env.VITE_USE_MOCK_API !== 'false',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  defaultGuildId: import.meta.env.VITE_DEFAULT_GUILD_ID || 'default-guild'
});

// Development controls for hot-swapping
export const developmentControls = import.meta.env.DEV ? {
  setImplementation(type: 'mock' | 'http'): void {
    const factory = ApiFactory.getInstance();
    factory.updateConfig({ 
      useMockData: type === 'mock' 
    });
  },
  
  getCurrentImplementation(): 'mock' | 'http' {
    const factory = ApiFactory.getInstance();
    return factory.getConfig().useMockData ? 'mock' : 'http';
  },
  
  getConfig(): IApiConfig {
    const factory = ApiFactory.getInstance();
    return factory.getConfig();
  }
} : undefined;

// Make dev controls available globally in development
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__ultiApiControls = developmentControls;
}
```

### Acceptance Criteria

- [ ] Factory updated with implementation selection logic
- [ ] Environment-based configuration from env vars
- [ ] Development controls for hot-swapping
- [ ] Singleton pattern maintains state
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify factory updated
grep -n "createMockSchedulingApi\|createHttpSchedulingApi" apps/website/src/lib/api/factory.ts

# Test TypeScript compilation
pnpm --filter website run type-check

# Verify development controls
grep -n "developmentControls" apps/website/src/lib/api/factory.ts
```

### File Operations

- **MODIFY**: `src/lib/api/factory.ts` (update with implementation selection)
- **NO CHANGES**: All other files remain unchanged

---

## Task 4.2: Create Unified Client Interface

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 4.1 complete

### Inputs

- Updated factory from Task 4.1
- Current `schedulingApi.ts` function signatures
- Backward compatibility requirements

### Outputs

- New unified client that wraps factory
- Function-based API matching current signatures
- Seamless integration with existing code

### Implementation

**Step 4.2.1**: Create unified client

**File**: `src/lib/api/client.ts` (CREATE NEW)

```typescript
import type {
  CreateEventRequest,
  ScheduledEvent,
  EventFilters,
  UpdateEventRequest,
  HelperData,
  Participant,
  DraftLock,
  LockParticipantRequest
} from '@ulti-project/shared';

import { ApiFactory, createDefaultConfig } from './factory.js';

// Singleton API client instance
let apiInstance: ReturnType<typeof ApiFactory.prototype.createSchedulingApi> | null = null;

function getApiClient() {
  if (!apiInstance) {
    const config = createDefaultConfig();
    const factory = ApiFactory.getInstance(config);
    apiInstance = factory.createSchedulingApi();
  }
  return apiInstance;
}

// Event Management API
export async function createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
  const client = getApiClient();
  return client.events.createEvent(request);
}

export async function getEvent(id: string): Promise<ScheduledEvent | null> {
  const client = getApiClient();
  return client.events.getEvent(id);
}

export async function getEvents(filters?: EventFilters): Promise<ScheduledEvent[]> {
  const client = getApiClient();
  const response = await client.events.getEvents(filters);
  return response.data; // Convert paginated response to simple array for compatibility
}

export async function updateEvent(id: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
  const client = getApiClient();
  return client.events.updateEvent(id, updates);
}

export async function deleteEvent(id: string, teamLeaderId: string): Promise<void> {
  const client = getApiClient();
  return client.events.deleteEvent(id, teamLeaderId);
}

// Helper Management API
export async function getHelpers(): Promise<HelperData[]> {
  const client = getApiClient();
  return client.helpers.getHelpers();
}

export async function isHelperAvailableForEvent(
  helperId: string, 
  eventStart: Date, 
  eventEnd: Date
): Promise<{ available: boolean; reason?: string }> {
  const client = getApiClient();
  const response = await client.helpers.checkHelperAvailability({
    helperId,
    startTime: eventStart,
    endTime: eventEnd
  });
  
  return {
    available: response.available,
    reason: response.reason
  };
}

// Participant Management API
export async function getProggers(filters?: { 
  encounter?: string; 
  role?: string; 
  job?: string 
}): Promise<Participant[]> {
  const client = getApiClient();
  return client.roster.getParticipants({
    ...filters,
    type: 'progger'
  });
}

export async function getAllParticipants(filters?: { 
  encounter?: string; 
  role?: string; 
  type?: 'helper' | 'progger' 
}): Promise<Participant[]> {
  const client = getApiClient();
  return client.roster.getParticipants(filters);
}

// Lock Management API
export async function lockParticipant(
  eventId: string, 
  teamLeaderId: string, 
  request: LockParticipantRequest
): Promise<DraftLock> {
  const client = getApiClient();
  return client.locks.lockParticipant(eventId, { ...request, teamLeaderId });
}

export async function releaseLock(
  eventId: string, 
  teamLeaderId: string, 
  participantId: string
): Promise<void> {
  const client = getApiClient();
  return client.locks.releaseLock(eventId, { participantId, teamLeaderId });
}

export async function getActiveLocks(eventId: string): Promise<DraftLock[]> {
  const client = getApiClient();
  return client.locks.getActiveLocks(eventId);
}

// Development utilities
export const developmentUtils = import.meta.env.DEV ? {
  getApiClient,
  resetApiClient(): void {
    apiInstance = null;
  },
  getCurrentImplementationType(): 'mock' | 'http' {
    const config = createDefaultConfig();
    return config.useMockData ? 'mock' : 'http';
  }
} : undefined;
```

### Acceptance Criteria

- [ ] Unified client with function-based API created
- [ ] All current `schedulingApi.ts` functions implemented
- [ ] Backward compatibility maintained
- [ ] Development utilities for testing
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify client functions created
grep -n "export async function" apps/website/src/lib/api/client.ts

# Test function signatures match
grep -n "createEvent\|getEvent\|getHelpers" apps/website/src/lib/api/client.ts

# Test compilation
pnpm --filter website run type-check
```

### File Operations

- **CREATE**: `src/lib/api/client.ts`
- **NO CHANGES**: All other files remain unchanged

---

## Task 4.3: Add Backward Compatibility Layer

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 4.2 complete

### Inputs

- Unified client from Task 4.2
- Current `schedulingApi.ts` usage patterns
- Migration requirements

### Outputs

- Updated main API index with exports
- Environment configuration setup
- Gradual migration path

### Implementation

**Step 4.3.1**: Update main API exports

**File**: `src/lib/api/index.ts` (MODIFY existing)

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
  ISchedulingApi
} from './interfaces/index.js';

// Export factory and configuration
export { ApiFactory, createDefaultConfig } from './factory.js';

// Export function-based client for backward compatibility
export * from './client.js';

// Export development controls
export { developmentControls } from './factory.js';

// Convenience function for creating API instances directly
export const createSchedulingApi = (guildId?: string) => {
  const config = createDefaultConfig();
  const factory = ApiFactory.getInstance(config);
  return factory.createSchedulingApi(guildId);
};
```

**Step 4.3.2**: Add environment configuration

**File**: `src/env.d.ts` (MODIFY to add API environment variables)

```typescript
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TOKEN?: string;
  readonly VITE_DEFAULT_GUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Acceptance Criteria

- [ ] Main API index exports all required items
- [ ] Environment variables properly typed
- [ ] Backward compatibility functions available
- [ ] Development controls exported
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify exports updated
grep -n "export" apps/website/src/lib/api/index.ts

# Verify environment types
grep -n "VITE_.*API" apps/website/src/env.d.ts

# Test compilation
pnpm --filter website run type-check
```

### File Operations

- **MODIFY**: `src/lib/api/index.ts` (add all exports)
- **MODIFY**: `src/env.d.ts` (add API environment variables)

---

## Phase 4 Completion Validation

### Final Acceptance Criteria

- [ ] All 3 tasks completed successfully
- [ ] Unified client integrates mock and HTTP implementations
- [ ] Factory pattern enables environment switching
- [ ] Backward compatibility maintained with existing API
- [ ] Development controls available for testing
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`
- [ ] Environment variables properly configured

### Final Validation Commands

```bash
# Comprehensive validation
pnpm --filter website run type-check
pnpm --filter website run build

# Verify client integration
grep -n "getApiClient" apps/website/src/lib/api/client.ts

# Test development controls
node -e "console.log('Dev controls available:', typeof window !== 'undefined' ? !!window.__ultiApiControls : 'N/A (server)')"
```

### Files Created/Modified

**New Files:**

- `src/lib/api/client.ts`

**Modified Files:**

- `src/lib/api/factory.ts` (implementation selection)
- `src/lib/api/index.ts` (complete exports)
- `src/env.d.ts` (environment variables)

### Ready for Phase 5

Unified client now ready for Phase 5 environment testing and validation.
  resetMockData(): void;
  getCurrentClient(): ApiClient;
}

// Expose development controls in non-production environments
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_API_HOTSWAP === 'true') {
  (globalThis as any).__ultiDevControls = {
    setApiImplementation(type: 'mock' | 'http') {
      // Temporarily override environment variable
      const originalValue = import.meta.env.VITE_USE_MOCK_API;
      import.meta.env.VITE_USE_MOCK_API = type === 'mock' ? 'true' : 'false';

      // Reset client instance to force recreation
      apiClientInstance = null;
      
      console.log(`API implementation switched to: ${type}`);
      
      // Restore original value (for next page load)
      import.meta.env.VITE_USE_MOCK_API = originalValue;
    },
    
    getApiImplementation() {
      return import.meta.env.VITE_USE_MOCK_API === 'true' ? 'mock' : 'http';
    },
    
    resetMockData() {
      if (import.meta.env.VITE_USE_MOCK_API === 'true') {
        // Reset mock data (implementation will be added in Phase 5)
        console.log('Mock data reset (implementation pending)');
      } else {
        console.warn('Cannot reset mock data - currently using HTTP implementation');
      }
    },
    
    getCurrentClient() {
      return getApiClient();
    },
  } satisfies DevControls;
}

// ===================================
// EVENT MANAGEMENT API
// ===================================

export async function createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
  return getApiClient().events.createEvent(request);
}

export async function getEvent(id: string): Promise<ScheduledEvent | null> {
  return getApiClient().events.getEvent(id);
}

export async function getEvents(filters?: EventFilters): Promise<ScheduledEvent[]> {
  return getApiClient().events.getEvents(filters);
}

export async function updateEvent(id: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
  return getApiClient().events.updateEvent(id, updates);
}

export async function deleteEvent(id: string, teamLeaderId: string): Promise<void> {
  return getApiClient().events.deleteEvent(id, teamLeaderId);
}

export function createEventStream(eventId: string): EventSource {
  return getApiClient().events.createEventStream(eventId);
}

// ===================================
// HELPER MANAGEMENT API
// ===================================

export async function getHelper(helperId: string): Promise<HelperData | null> {
  return getApiClient().helpers.getHelper(helperId);
}

export async function getHelpers(): Promise<HelperData[]> {
  return getApiClient().helpers.getHelpers();
}

export async function getHelperAbsences(helperId: string): Promise<HelperAbsence[]> {
  return getApiClient().helpers.getHelperAbsences(helperId);
}

export async function createHelperAbsence(request: CreateHelperAbsenceRequest): Promise<HelperAbsence> {
  return getApiClient().helpers.createHelperAbsence(request);
}

export async function updateHelperAbsence(absenceId: string, updates: Partial<HelperAbsence>): Promise<HelperAbsence> {
  return getApiClient().helpers.updateHelperAbsence(absenceId, updates);
}

export async function deleteHelperAbsence(absenceId: string): Promise<void> {
  return getApiClient().helpers.deleteHelperAbsence(absenceId);
}

export function createHelpersStream(): EventSource {
  return getApiClient().helpers.createHelpersStream();
}

// ===================================
// ROSTER MANAGEMENT API
// ===================================

export async function assignParticipant(request: AssignParticipantRequest): Promise<Participant> {
  return getApiClient().roster.assignParticipant(request);
}

export async function unassignParticipant(request: UnassignParticipantRequest): Promise<void> {
  return getApiClient().roster.unassignParticipant(request);
}

export async function getEventParticipants(eventId: string): Promise<Participant[]> {
  return getApiClient().roster.getEventParticipants(eventId);
}

export function createRosterStream(eventId: string): EventSource {
  return getApiClient().roster.createRosterStream(eventId);
}

// ===================================
// DRAFT LOCK API
// ===================================

export async function lockParticipant(request: LockParticipantRequest): Promise<DraftLock> {
  return getApiClient().locks.lockParticipant(request);
}

export async function unlockParticipant(request: UnlockParticipantRequest): Promise<void> {
  return getApiClient().locks.unlockParticipant(request);
}

export async function getEventLocks(eventId: string): Promise<DraftLock[]> {
  return getApiClient().locks.getEventLocks(eventId);
}

export async function renewLock(lockId: string): Promise<DraftLock> {
  return getApiClient().locks.renewLock(lockId);
}

export function createLocksStream(eventId: string): EventSource {
  return getApiClient().locks.createLocksStream(eventId);
}

// ===================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ===================================

// Re-export types for convenience (matching old schedulingApi.ts)
export type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  HelperData,
  HelperAbsence,
  CreateHelperAbsenceRequest,
  Participant,
  AssignParticipantRequest,
  UnassignParticipantRequest,
  DraftLock,
  LockParticipantRequest,
  UnlockParticipantRequest,
} from '@ulti-project/shared';

```

### 4.3 Gradual Integration Strategy

Since we're enhancing rather than replacing the existing system, we'll implement a gradual integration approach:

#### Step 1: Create the new client alongside the existing `schedulingApi.ts`

#### Step 2: Update a single hook to use the new client for testing

**File**: `src/hooks/useEvents.test.ts` (create test hook)

```typescript
// Test the new API client with a single hook
import { useState, useEffect } from 'react';
import type { ScheduledEvent, EventFilters } from '@ulti-project/shared';
import * as newApiClient from '../lib/api/client.js';

export function useEventsNew(filters?: EventFilters) {
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadEvents = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await newApiClient.getEvents(filters);
        if (isMounted) {
          setEvents(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load events');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadEvents();
    
    return () => {
      isMounted = false;
    };
  }, [filters]);

  return {
    events,
    isLoading,
    error,
    createEvent: newApiClient.createEvent,
    updateEvent: newApiClient.updateEvent,
    deleteEvent: newApiClient.deleteEvent,
  };
}
```

#### Step 3: Once validated, update imports gradually

### 4.4 Update Import References

Since we're replacing `schedulingApi.ts`, we need to ensure all imports are updated to use the new client.

**Check existing imports:**

```bash
pnpm grep_search "from.*schedulingApi" src/
```

**Update import statements:**

```typescript
// Old import
import { createEvent, getEvents } from '../lib/schedulingApi.js';

// New import (should remain exactly the same)
import { createEvent, getEvents } from '../lib/api/client.js';
```

### 4.5 Environment Configuration Updates

**File**: Update `.env.development` (create if needed)

```env
# Development environment - use mock API by default
VITE_USE_MOCK_API=true
VITE_ENABLE_API_HOTSWAP=true
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TOKEN=dev-token
```

**File**: Update `.env.production` (create if needed)

```env
# Production environment - use real API
VITE_USE_MOCK_API=false
VITE_ENABLE_API_HOTSWAP=false
VITE_API_BASE_URL=https://api.ulti-project.com
# VITE_API_TOKEN will be set by deployment system
```

### 4.6 Add Environment Type Definitions

**File**: `src/env.d.ts` (update existing)

```typescript
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_ENABLE_API_HOTSWAP?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Development controls (only available in development)
declare global {
  interface Window {
    __ultiDevControls?: {
      setApiImplementation(type: 'mock' | 'http'): void;
      getApiImplementation(): 'mock' | 'http';
      resetMockData(): void;
      getCurrentClient(): any;
    };
  }
}
```

### 4.7 Create Migration Script

**File**: `scripts/migrate-api-imports.js`

```javascript
#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function findTsFiles(dir, files = []) {
  const dirents = await readdir(dir, { withFileTypes: true });
  
  for (const dirent of dirents) {
    const path = join(dir, dirent.name);
    
    if (dirent.isDirectory() && !dirent.name.startsWith('.')) {
      await findTsFiles(path, files);
    } else if (dirent.name.endsWith('.ts') || dirent.name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  
  return files;
}

async function updateImports() {
  const files = await findTsFiles('./src');
  let updatedCount = 0;
  
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const updated = content.replace(
      /from ['"]\.\.?\/.*?schedulingApi(?:\.js)?['"];?/g,
      (match) => {
        const relativePath = file.includes('/src/') 
          ? '../lib/api/client.js' 
          : './lib/api/client.js';
        return match.replace(/schedulingApi(?:\.js)?/, 'api/client.js');
      }
    );
    
    if (updated !== content) {
      await writeFile(file, updated, 'utf-8');
      updatedCount++;
      console.log(`Updated: ${file}`);
    }
  }
  
  console.log(`Migration complete. Updated ${updatedCount} files.`);
}

updateImports().catch(console.error);
```

### 4.8 Run Migration and Validation

**Run the migration script:**

```bash
cd /Users/steve/dev/ulti-project/apps/website
node scripts/migrate-api-imports.js
```

**Test the new client:**

```typescript
// Test file: src/lib/api/__tests__/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as client from '../client.js';

describe('API Client', () => {
  it('exports all expected functions', () => {
    expect(typeof client.createEvent).toBe('function');
    expect(typeof client.getEvent).toBe('function');
    expect(typeof client.getEvents).toBe('function');
    expect(typeof client.updateEvent).toBe('function');
    expect(typeof client.deleteEvent).toBe('function');
    expect(typeof client.createEventStream).toBe('function');
    
    expect(typeof client.getHelper).toBe('function');
    expect(typeof client.getHelpers).toBe('function');
    
    expect(typeof client.assignParticipant).toBe('function');
    expect(typeof client.unassignParticipant).toBe('function');
    
    expect(typeof client.lockParticipant).toBe('function');
    expect(typeof client.unlockParticipant).toBe('function');
  });

  it('uses mock implementation in test environment', async () => {
    // Set test environment
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    
    const events = await client.getEvents();
    expect(Array.isArray(events)).toBe(true);
  });
});
```

## ✅ Validation Criteria

### Completion Requirements

- [ ] New API client factory created with environment-based selection
- [ ] New API client (`src/lib/api/client.ts`) created wrapping enhanced mock system
- [ ] Client provides identical interface to old `schedulingApi.ts`
- [ ] Enhanced mock implementations properly integrated via factory
- [ ] Environment variables properly configured for all environments
- [ ] Development controls available when enabled
- [ ] Test hook validates new client works with existing mock data
- [ ] All sophisticated mock features preserved (SSE, realistic data, etc.)
- [ ] TypeScript compilation passes without errors
- [ ] Gradual migration path established

### Backward Compatibility Test

```typescript
// Verify that the new client maintains compatibility with enhanced mock system
import { useEventsNew } from '../hooks/useEvents.test.js';

// Test that hook can import and use the API functions
const TestComponent = () => {
  const { events, createEvent } = useEventsNew();
  
  // These should work exactly as before, using enhanced mock data
  expect(typeof createEvent).toBe('function');
  expect(Array.isArray(events)).toBe(true);
  
  // Verify enhanced mock features are preserved
  expect(events.length).toBeGreaterThan(0); // Should have realistic mock data
};
```

### Environment Switching Test

```typescript
// Test environment switching with enhanced mock system
describe('Environment Switching', () => {
  it('uses enhanced mock when VITE_USE_MOCK_API=true', async () => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    const events = await client.getEvents();
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0); // Should have realistic mock data
  });

  it('throws for HTTP when not implemented', async () => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'false');
    await expect(client.getEvents()).rejects.toThrow('not implemented');
  });
});
```

### Development Controls Test

```typescript
// Test development controls (only in development)
if (import.meta.env.DEV) {
  describe('Development Controls', () => {
    it('exposes dev controls when enabled', () => {
      expect(window.__ultiDevControls).toBeDefined();
      expect(typeof window.__ultiDevControls?.setApiImplementation).toBe('function');
    });
  });
}
```

## 🔄 Next Steps

After completing this phase:

1. **Verify new client integrates properly with enhanced mock system**
2. **Test environment switching between enhanced mock and HTTP**
3. **Validate all sophisticated mock features are preserved**
4. **Ensure development controls work properly**
5. **Run test hook to validate compatibility**
6. **Proceed to [Phase 5: Environment & Testing](./phase-5-environment-testing.md)**

## ⚠️ Important Notes

- **Gradual integration approach** - create new client alongside existing system first
- **Preserve enhanced mock features** - ensure all sophisticated functionality remains
- **Test thoroughly** - validate integration with existing mock data and SSE simulation
- **Environment variables should be properly typed** - update `env.d.ts`
- **Development controls should only be enabled in development** - never in production
- **Keep old `schedulingApi.ts` until full validation is complete** - for easy rollback
- **SSE and session persistence must continue working** - critical mock features

---

**Phase Dependencies**: ✅ Phases 1-3  
**Next Phase**: [Phase 5: Environment & Testing](./phase-5-environment-testing.md)
