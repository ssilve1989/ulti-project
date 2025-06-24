# Phase 7: Code Migration to New API System

**Duration**: 60-90 minutes  
**Complexity**: Medium  
**Dependencies**: Phase 6 (Integration Finalization)

## Overview

**Goal**: Replace all existing direct mock function calls with the new API system to enable environment switching.

**Problem**: The codebase currently calls mock functions directly from `src/lib/mock/` instead of using the new factory-based API system. This prevents environment switching and doesn't utilize the new React Query integration.

**Strategy**: Systematically find and replace all direct mock calls with either:
1. React Query hooks (recommended for components)
2. Direct API calls (for utilities/functions)

## Current State Analysis

The codebase likely has calls like:
```typescript
// OLD - Direct mock calls (current state)
import { getEvents } from '../lib/mock/events.js';
import { getHelpers } from '../lib/mock/helpers.js';

const events = await getEvents(filters);
const helpers = await getHelpers();
```

We need to replace these with:
```typescript
// NEW - Via React Query hooks (recommended)
import { useEventsQuery, useHelpersQuery } from '../hooks/queries/useEventsQuery.js';

const { data: events } = useEventsQuery(filters);
const { data: helpers } = useHelpersQuery();

// OR - Direct API calls (for non-React contexts)
import { api } from '../lib/api/client.js';

const events = await api.events.getEvents(filters);
const helpers = await api.helpers.getHelpers();
```

## Current State - Files Requiring Migration

The following files currently import from the old `schedulingApi.js` and need migration:

1. `src/components/scheduling/RosterBuilder.tsx`
2. `src/components/scheduling/ParticipantPool.tsx` 
3. `src/components/scheduling/RosterManagement.tsx`
4. `src/components/scheduling/EventManagement.tsx`
5. `src/components/scheduling/EventHeader.tsx`

**Old Pattern (current)**:
```typescript
import { getEvents, lockParticipant } from '../../lib/schedulingApi.js';

// Manual state management
const [events, setEvents] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  loadEvents();
}, []);
```

**New Pattern (target)**:
```typescript
import { useEventsQuery, useLockParticipantMutation } from '../../hooks/queries/useEventsQuery.js';

// React Query handles state automatically
const { data: events, isLoading } = useEventsQuery();
const lockMutation = useLockParticipantMutation();
```

## Implementation

### Step 7.1: Audit Current Usage (✅ Complete)

**Action**: Find all direct imports and calls to mock functions.

```bash
# Search for direct mock imports
grep -r "from.*mock" apps/website/src --include="*.ts" --include="*.tsx" --exclude-dir=__tests__

# Search for specific mock function calls
grep -r "getEvents\|getHelpers\|getParticipants\|lockParticipant" apps/website/src --include="*.ts" --include="*.tsx" --exclude-dir=__tests__

# Search for mock directory imports
grep -r "lib/mock" apps/website/src --include="*.ts" --include="*.tsx" --exclude-dir=__tests__
```

**Document findings**: Create list of files that need migration and their current usage patterns.

### Step 7.2: Migrate React Components to React Query

**Target**: All React components (`.tsx` files) should use React Query hooks.

**Pattern**:
```typescript
// BEFORE
import { getEvents } from '../lib/mock/events.js';

export function EventsList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function loadEvents() {
      try {
        const eventData = await getEvents();
        setEvents(eventData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  if (loading) return <div>Loading...</div>;
  return <div>{/* render events */}</div>;
}

// AFTER
import { useEventsQuery } from '../hooks/queries/useEventsQuery.js';

export function EventsList() {
  const { data: events, isLoading, error } = useEventsQuery();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{/* render events */}</div>;
}
```

**Benefits of React Query migration**:
- Automatic caching and background refetching
- Loading and error states handled automatically
- Optimistic updates and cache invalidation
- Better performance and user experience

### Step 7.3: Migrate Utility Functions to Direct API

**Target**: Non-React utility functions, API routes, and server-side code.

**Pattern**:
```typescript
// BEFORE
import { getEvents, createEvent } from '../lib/mock/events.js';

export async function processEvents(filters) {
  const events = await getEvents(filters);
  return events.filter(event => /* some logic */);
}

// AFTER
import { api } from '../lib/api/client.js';

export async function processEvents(filters) {
  const events = await api.events.getEvents(filters);
  return events.filter(event => /* some logic */);
}
```

### Step 7.4: Update API Routes and Server Functions

**Target**: Astro API routes and server-side functions.

**Pattern**:
```typescript
// BEFORE - In API routes
import { getEvents } from '../../lib/mock/events.js';

export async function GET({ request }) {
  const events = await getEvents();
  return new Response(JSON.stringify(events));
}

// AFTER - In API routes  
import { api } from '../../lib/api/client.js';

export async function GET({ request }) {
  const events = await api.events.getEvents();
  return new Response(JSON.stringify(events));
}
```

### Step 7.5: Handle Special Cases

**Mutations in Components**:
```typescript
// BEFORE
import { createEvent } from '../lib/mock/events.js';

const handleCreate = async (eventData) => {
  try {
    await createEvent(eventData);
    // Manually refresh data
    window.location.reload();
  } catch (error) {
    setError(error.message);
  }
};

// AFTER
import { useCreateEventMutation } from '../hooks/queries/useEventsQuery.js';

const createEventMutation = useCreateEventMutation();

const handleCreate = (eventData) => {
  createEventMutation.mutate(eventData, {
    onSuccess: () => {
      // Cache automatically invalidated - no manual refresh needed
    },
    onError: (error) => {
      setError(error.message);
    }
  });
};
```

**Event Listeners and Real-time Updates**:
```typescript
// BEFORE
import { subscribeToEvents } from '../lib/mock/events.js';

useEffect(() => {
  const unsubscribe = subscribeToEvents((newEvent) => {
    setEvents(prev => [...prev, newEvent]);
  });
  return unsubscribe;
}, []);

// AFTER
import { useEventsQuery } from '../hooks/queries/useEventsQuery.js';

const { data: events, refetch } = useEventsQuery();

useEffect(() => {
  // Set up real-time subscription via the API
  const unsubscribe = api.events.subscribeToEvents((newEvent) => {
    // Invalidate cache to trigger refetch
    queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
  });
  return unsubscribe;
}, []);
```

### Step 7.6: Update Import Statements

**Remove old mock imports**:
```typescript
// REMOVE these imports
import { getEvents, createEvent } from '../lib/mock/events.js';
import { getHelpers } from '../lib/mock/helpers.js';
import { getParticipants } from '../lib/mock/participants.js';

// REPLACE with these imports
import { useEventsQuery, useCreateEventMutation } from '../hooks/queries/useEventsQuery.js';
import { useHelpersQuery } from '../hooks/queries/useHelpersQuery.js';
import { api } from '../lib/api/client.js'; // For non-React contexts
```

### Step 7.7: Validation and Testing

**After each file migration**:
```bash
# Ensure TypeScript compilation passes
pnpm --filter website run typecheck

# Test both environments work
VITE_USE_MOCK_API=true pnpm --filter website run dev
VITE_USE_MOCK_API=false pnpm --filter website run dev
```

**Functional testing**:
1. Verify all pages load without errors
2. Test CRUD operations work the same as before
3. Verify loading states and error handling
4. Test real-time updates and subscriptions
5. Confirm environment switching works

## Migration Checklist

### Files to Migrate (Typical Locations)
- [ ] `src/components/**/*.tsx` - React components
- [ ] `src/pages/**/*.astro` - Astro pages
- [ ] `src/pages/api/**/*.ts` - API routes
- [ ] `src/lib/**/*.ts` - Utility functions
- [ ] `src/hooks/**/*.ts` - Custom hooks
- [ ] `src/stores/**/*.ts` - State management

### Component Migration Checklist
For each React component:
- [ ] Replace direct mock imports with React Query hooks
- [ ] Remove manual state management (useState/useEffect for data fetching)
- [ ] Update loading and error handling to use React Query state
- [ ] Replace manual mutations with React Query mutations
- [ ] Test component renders correctly with new API

### Utility Migration Checklist
For each utility function:
- [ ] Replace mock imports with `import { api } from '../lib/api/client.js'`
- [ ] Update function calls to use `api.domain.method()` pattern
- [ ] Ensure async/await patterns are maintained
- [ ] Test utility functions work with both mock and HTTP environments

## Success Criteria

- [ ] Zero direct imports from `src/lib/mock/` in application code
- [ ] All components use React Query hooks for data fetching
- [ ] All utilities use the centralized API client
- [ ] TypeScript compilation passes with no errors
- [ ] Both `VITE_USE_MOCK_API=true` and `VITE_USE_MOCK_API=false` work
- [ ] All existing functionality preserved
- [ ] Performance improved due to React Query caching
- [ ] Loading states and error handling improved

## Expected Benefits After Migration

1. **Environment Switching**: Seamless transition between mock and HTTP APIs
2. **Better Performance**: React Query caching eliminates redundant requests
3. **Improved UX**: Better loading states and error handling
4. **Maintainability**: Single source of truth for API calls
5. **Type Safety**: All API calls go through typed interfaces
6. **Real-time Ready**: Easy to add WebSocket/SSE when needed

## File Operations

- **MODIFY**: All files currently importing from `src/lib/mock/`
- **UPDATE**: Import statements throughout the codebase
- **ENHANCE**: Components with better loading/error states
- **VALIDATE**: Ensure functional equivalence maintained

## Rollback Plan

If issues arise during migration:
1. Revert specific file changes using git
2. Keep old mock imports temporarily alongside new API calls
3. Use feature flags to gradually roll out new API usage
4. Test extensively in development before production deployment

---

**Phase Dependencies**: ✅ Phase 6 (Integration Finalization)  
**Next Phase**: Production deployment and monitoring

## Validation Commands

```bash
# Find remaining direct mock imports (should return empty)
grep -r "from.*lib/mock" apps/website/src --include="*.ts" --include="*.tsx" --exclude-dir=__tests__

# Test both environments
VITE_USE_MOCK_API=true pnpm --filter website run build
VITE_USE_MOCK_API=false pnpm --filter website run build

# TypeScript validation
pnpm --filter website run typecheck

# Full test suite
pnpm --filter website test --run --if-present
```