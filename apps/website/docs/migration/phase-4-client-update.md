# Phase 4: API Client Update

**Duration**: 1 day  
**Complexity**: Medium  
**Dependencies**: Phases 1-3

## 🎯 Phase Goals

Replace the existing `schedulingApi.ts` with a new dependency-injected API client that maintains complete backward compatibility while enabling environment-based switching between mock and HTTP implementations.

## 📋 Context

At this phase, we have:

- ✅ API interfaces defined (Phase 1)
- ✅ Mock implementations working (Phase 2)  
- ✅ HTTP stubs created (Phase 3)
- 🎯 Need to replace `schedulingApi.ts` with new client

The new API client will:

- Use dependency injection to select implementations
- Maintain identical function signatures to current `schedulingApi.ts`
- Enable environment-based switching
- Provide development controls for hot-swapping
- Ensure zero breaking changes for existing hooks and components

## 🔧 Implementation Steps

### 4.1 Create New API Client

**File**: `src/lib/api/client.ts`

```typescript
import type {
  CreateEventRequest,
  ScheduledEvent,
  EventFilters,
  UpdateEventRequest,
  HelperData,
  HelperAbsence,
  CreateHelperAbsenceRequest,
  AssignParticipantRequest,
  Participant,
  UnassignParticipantRequest,
  DraftLock,
  LockParticipantRequest,
  UnlockParticipantRequest,
} from '@ulti-project/shared';

import { createApiClient } from './factory.js';
import type { ApiClient } from './factory.js';

// Singleton API client instance
let apiClientInstance: ApiClient | null = null;

function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = createApiClient();
  }
  return apiClientInstance;
}

// Development controls for hot-swapping
interface DevControls {
  setApiImplementation(type: 'mock' | 'http'): void;
  getApiImplementation(): 'mock' | 'http';
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

### 4.2 Update Import References

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

### 4.3 Environment Configuration Updates

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

### 4.4 Add Environment Type Definitions

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

### 4.5 Create Migration Script

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

### 4.6 Run Migration and Validation

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

- [ ] New API client (`src/lib/api/client.ts`) created with all functions
- [ ] Client provides identical interface to old `schedulingApi.ts`
- [ ] Environment variables properly configured for all environments
- [ ] Development controls available when enabled
- [ ] All imports updated to use new client
- [ ] TypeScript compilation passes without errors
- [ ] All existing tests pass without modification

### Backward Compatibility Test

```typescript
// Verify that existing hooks continue working
import { useEvents } from '../hooks/useEvents.js';

// Test that hook can import and use the API functions
const TestComponent = () => {
  const { events, createEvent } = useEvents();
  
  // These should work exactly as before
  expect(typeof createEvent).toBe('function');
  expect(Array.isArray(events)).toBe(true);
};
```

### Environment Switching Test

```typescript
// Test environment switching
describe('Environment Switching', () => {
  it('uses mock when VITE_USE_MOCK_API=true', async () => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    const events = await client.getEvents();
    expect(events).toBeDefined();
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

1. **Verify all functions work identically to old `schedulingApi.ts`**
2. **Test environment switching between mock and HTTP**
3. **Validate development controls work properly**
4. **Run all existing tests to ensure no breaking changes**
5. **Proceed to [Phase 5: Environment & Testing](./phase-5-environment-testing.md)**

## ⚠️ Important Notes

- **Maintain exact function signatures** - any change will break existing hooks
- **Test thoroughly** - this is the critical integration point
- **Environment variables should be properly typed** - update `env.d.ts`
- **Development controls should only be enabled in development** - never in production
- **Keep old `schedulingApi.ts` until validation is complete** - for easy rollback

---

**Phase Dependencies**: ✅ Phases 1-3  
**Next Phase**: [Phase 5: Environment & Testing](./phase-5-environment-testing.md)
