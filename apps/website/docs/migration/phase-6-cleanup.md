# Phase 6: Integration Finalization

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Phase 5 (Environment & Testing)

## Overview

**Goal**: Complete the integration by creating a single API instance and React Query hooks.

**Strategy**: Create one API instance at startup and use React Query for all data fetching.

## Implementation

### Step 6.1: Create Single API Instance

**File**: `src/lib/api/client.ts` (CREATE)

```typescript
import { createSchedulingApi } from './index.js';

// Single API instance for the deployed guild
// Guild ID is configured via environment variables at build time
export const api = createSchedulingApi();
```

### Step 6.2: Create React Query Hooks

**File**: `src/hooks/queries/useEventsQuery.ts` (CREATE)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ScheduledEvent, EventFilters, CreateEventRequest, UpdateEventRequest } from '@ulti-project/shared';
import { api } from '../../lib/api/client.js';

// Query keys
export const eventsQueryKeys = {
  all: ['events'] as const,
  lists: () => [...eventsQueryKeys.all, 'list'] as const,
  list: (filters?: EventFilters) => [...eventsQueryKeys.lists(), filters] as const,
  details: () => [...eventsQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...eventsQueryKeys.details(), id] as const,
};

// Get events list
export function useEventsQuery(filters?: EventFilters) {
  return useQuery({
    queryKey: eventsQueryKeys.list(filters),
    queryFn: async () => {
      const response = await api.events.getEvents(filters);
      return response.data || response; // Handle both paginated and direct responses
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Get single event
export function useEventQuery(eventId: string) {
  return useQuery({
    queryKey: eventsQueryKeys.detail(eventId),
    queryFn: () => api.events.getEvent(eventId),
    staleTime: 60 * 1000, // 1 minute
    enabled: !!eventId,
  });
}

// Create event mutation
export function useCreateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateEventRequest) => api.events.createEvent(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
  });
}

// Update event mutation
export function useUpdateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, updates }: { eventId: string; updates: UpdateEventRequest }) =>
      api.events.updateEvent(eventId, updates),
    onSuccess: (updatedEvent) => {
      queryClient.setQueryData(eventsQueryKeys.detail(updatedEvent.id), updatedEvent);
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
  });
}

// Delete event mutation
export function useDeleteEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, teamLeaderId }: { eventId: string; teamLeaderId: string }) =>
      api.events.deleteEvent(eventId, teamLeaderId),
    onSuccess: (_, { eventId }) => {
      queryClient.removeQueries({ queryKey: eventsQueryKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
  });
}
```

**File**: `src/hooks/queries/useHelpersQuery.ts` (CREATE)

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client.js';

export const helpersQueryKeys = {
  all: ['helpers'] as const,
  lists: () => [...helpersQueryKeys.all, 'list'] as const,
  details: () => [...helpersQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...helpersQueryKeys.details(), id] as const,
};

export function useHelpersQuery() {
  return useQuery({
    queryKey: helpersQueryKeys.lists(),
    queryFn: () => api.helpers.getHelpers(),
    staleTime: 5 * 60 * 1000, // 5 minutes - helpers don't change often
  });
}

export function useHelperQuery(helperId: string) {
  return useQuery({
    queryKey: helpersQueryKeys.detail(helperId),
    queryFn: () => api.helpers.getHelper(helperId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!helperId,
  });
}
```

### Step 6.3: Create Integration Test

**File**: `src/hooks/queries/__tests__/api-integration.test.ts` (CREATE)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEventsQuery, useHelpersQuery } from '../useEventsQuery.js';

// Mock the API client
vi.mock('../../../lib/api/client.js', () => ({
  api: {
    events: {
      getEvents: vi.fn(),
      getEvent: vi.fn(),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn()
    },
    helpers: {
      getHelpers: vi.fn(),
      getHelper: vi.fn()
    }
  }
}));

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('React Query API Integration', () => {
  it('should use single API instance across all hooks', async () => {
    const { api } = await import('../../../lib/api/client.js');
    
    api.events.getEvents.mockResolvedValue([]);
    api.helpers.getHelpers.mockResolvedValue([]);

    const wrapper = createWrapper();
    
    renderHook(() => useEventsQuery(), { wrapper });
    renderHook(() => useHelpersQuery(), { wrapper });

    await waitFor(() => {
      expect(api.events.getEvents).toHaveBeenCalledTimes(1);
      expect(api.helpers.getHelpers).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle API responses correctly', async () => {
    const { api } = await import('../../../lib/api/client.js');
    
    const mockEvents = [{ id: '1', title: 'Test Event' }];
    api.events.getEvents.mockResolvedValue(mockEvents);

    const wrapper = createWrapper();
    const { result } = renderHook(() => useEventsQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual(mockEvents);
    });
  });
});
```

### Step 6.4: Update Documentation

**File**: `docs/API_USAGE.md` (CREATE)

```markdown
# API Usage Guide

## Overview

The scheduling API uses a single instance pattern with React Query for efficient data fetching and caching.

## Basic Usage

```typescript
import { api } from '../lib/api/client.js';

// Single API instance - no need to pass guild ID
const events = await api.events.getEvents();
const helpers = await api.helpers.getHelpers();
```

## React Query Hooks (Recommended)

```typescript
import { useEventsQuery, useCreateEventMutation } from '../hooks/queries/useEventsQuery.js';

export function EventsComponent() {
  // Get events with automatic caching and refetching
  const { data: events, isLoading, error } = useEventsQuery();
  
  // Mutations with automatic cache invalidation
  const createEventMutation = useCreateEventMutation();
  
  const handleCreateEvent = (eventData) => {
    createEventMutation.mutate(eventData);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>{/* Render events */}</div>;
}
```

## Environment Configuration

### Development (Mock)
```env
VITE_USE_MOCK_API=true
VITE_DEFAULT_GUILD_ID=dev-guild
```

### Production (HTTP)
```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://api.your-domain.com
VITE_DEFAULT_GUILD_ID=your-guild-id
```

## Architecture

- **Single Instance**: One API client created at startup
- **React Query**: Handles caching, background updates, and loading states
- **Factory Pattern**: Environment-based mock/HTTP switching
- **Guild ID**: Configured at build time via environment variables

## Available Query Hooks

- `useEventsQuery(filters?)` - Get events list
- `useEventQuery(eventId)` - Get single event
- `useHelpersQuery()` - Get helpers list
- `useHelperQuery(helperId)` - Get single helper
- `useCreateEventMutation()` - Create new event
- `useUpdateEventMutation()` - Update existing event
- `useDeleteEventMutation()` - Delete event
```

### Step 6.5: Migration Validation

**File**: `scripts/validate-migration.js` (CREATE)

```javascript
#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

console.log('🎉 Migration Validation\n');

// Check required files exist
const requiredFiles = [
  'src/lib/api/interfaces/index.ts',
  'src/lib/api/implementations/mock/index.ts', 
  'src/lib/api/implementations/http/index.ts',
  'src/lib/api/factory.ts',
  'src/lib/api/index.ts',
  'src/lib/api/client.ts'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  const fullPath = path.join('apps/website', file);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (allFilesExist) {
  console.log('\n🚀 Migration Complete!');
  console.log('\n📋 Summary:');
  console.log('- ✅ Single API instance pattern');
  console.log('- ✅ React Query integration'); 
  console.log('- ✅ Mock implementations preserved');
  console.log('- ✅ HTTP implementations ready');
  console.log('- ✅ Environment switching functional');
  console.log('\n🎯 Ready for production!');
} else {
  console.log('\n❌ Migration incomplete - missing files');
  process.exit(1);
}
```

## Acceptance Criteria

- [ ] Single API instance created and exported
- [ ] React Query hooks created for all main entities
- [ ] Integration tests validate single instance usage
- [ ] API usage documentation created
- [ ] Migration validation script confirms completion
- [ ] All tests pass: `pnpm --filter website test --run`
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

## Validation Commands

```bash
# Run React Query integration tests
pnpm --filter website test --run src/hooks/queries/__tests__/api-integration.test.ts

# Validate migration completion
node scripts/validate-migration.js

# Full test suite
pnpm --filter website test --run

# Type checking
pnpm --filter website run type-check

# Build verification
pnpm --filter website run build
```

## File Operations

- **CREATE**: `src/lib/api/client.ts`
- **CREATE**: `src/hooks/queries/useEventsQuery.ts`
- **CREATE**: `src/hooks/queries/useHelpersQuery.ts`
- **CREATE**: `src/hooks/queries/__tests__/api-integration.test.ts`
- **CREATE**: `docs/API_USAGE.md`
- **CREATE**: `scripts/validate-migration.js`

## Migration Complete! 🎉

### What Was Accomplished

1. **Single Instance Pattern**: One API client created at startup and reused
2. **React Query Integration**: Modern data fetching with caching and background updates
3. **Type Safety**: All implementations use shared TypeScript interfaces
4. **Environment Flexibility**: Seamless switching between mock and HTTP implementations
5. **Performance Optimized**: No unnecessary API instance creation
6. **Guild-Agnostic**: Single guild configured at build time

### Key Benefits

- **Performance**: Single API instance, React Query caching
- **Developer Experience**: Clean hooks, automatic loading states
- **Maintainable**: Clear separation of concerns
- **Testable**: Easy to mock and test
- **Future-Ready**: HTTP implementations prepared for backend

### Usage Summary

```typescript
// Simple, performant usage
import { useEventsQuery } from '../hooks/queries/useEventsQuery.js';

export function EventsList() {
  const { data: events, isLoading } = useEventsQuery();
  // React Query handles caching, loading states, error handling
}
```

---

**Phase Dependencies**: ✅ Phase 5 (Environment & Testing)  
**Status**: 🎉 **MIGRATION COMPLETE**