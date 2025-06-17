# Project Context

## Overview

This is a pnpm workspaces repository containing a Discord bot and website application for managing Ultimate raid static scheduling in Final Fantasy XIV. The project uses TypeScript, React hooks, and a shared package for type definitions.

## Current Architecture

### Technology Stack

- **Build System**: pnpm workspaces with Vite
- **Frontend**: Astro + React with TypeScript
- **Backend**: NestJS with Fastify
- **Database**: Firebase Firestore
- **Testing**: Vitest
- **Shared Types**: `@ulti-project/shared` package with Zod schemas

### Project Structure

```
ulti-project/
├── apps/
│   ├── discord-bot/          # NestJS backend API
│   └── website/              # Astro + React frontend
├── packages/
│   └── shared/               # Shared types and schemas
└── docs/                     # Project documentation
```

### Current Mock System Location

- **Mock Files**: `apps/website/src/lib/mock/`
- **API Layer**: `apps/website/src/lib/schedulingApi.ts`
- **React Hooks**: Various files consuming the scheduling API
- **Components**: UI components using React hooks for data fetching

## Domain Model

### Core Entities

- **Events**: Scheduled raid sessions with rosters
- **Helpers**: Experienced players who can fill multiple jobs/roles
- **Participants**: Proggers (learning players) and helpers
- **Locks**: Draft system for preventing concurrent roster editing
- **Absences**: Helper unavailability periods

### Key Features

- **Real-time collaboration**: SSE streams for live roster updates
- **Draft lock system**: 30-minute timeouts to prevent conflicts
- **Helper availability**: Complex scheduling with job preferences
- **Role validation**: Ensures proper party composition (2 tanks, 2 healers, 4 DPS)

## Shared Package Integration

### Type Definitions (`@ulti-project/shared`)

```typescript
// Core types
export type { ScheduledEvent, HelperData, Participant } from './types/scheduling.js';

// API request/response types
export type { 
  CreateEventRequest, 
  UpdateEventRequest,
  AssignParticipantRequest 
} from './types/scheduling.js';

// Enums
export { Job, Role, EventStatus, ParticipantType } from './schemas/api/common.js';
```

### Schema Validation (`@ulti-project/shared/schemas`)

```typescript
// Zod schemas for validation (used by backend)
export { 
  CreateEventRequestSchema,
  ScheduledEventSchema,
  HelperDataSchema 
} from './api/events.js';
```

### Import Pattern

```typescript
// ✅ CORRECT: Import from shared package
import type { CreateEventRequest, ScheduledEvent } from '@ulti-project/shared';

// ❌ INCORRECT: Local type definitions
interface LocalCreateEventRequest { /* ... */ }
```

## Current API Layer

### Current Implementation (`schedulingApi.ts`)

- **Pattern**: Direct function exports with environment switching
- **Mock Detection**: `USE_MOCK_DATA` boolean flag
- **Import Strategy**: Dynamic imports for mock functions
- **Interface**: React hooks consume these functions directly

### Example Current Usage

```typescript
// Current API consumption
import { createEvent, getEvents } from '../lib/schedulingApi.ts';

// React hook usage
const { data: events } = useQuery(['events'], getEvents);
```

## React Hooks Integration

### Current Hook Pattern

```typescript
// Typical React Query hook
export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: () => getEvents(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### SSE Integration

```typescript
// Current SSE usage
const eventSource = createEventEventSource(eventId);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  queryClient.invalidateQueries(['events']);
};
```

## Environment Configuration

### Current Environment Variables

```typescript
// Vite environment detection
const isDevelopment = import.meta.env.DEV;
const USE_MOCK_DATA = true; // Currently hardcoded
```

### Astro Configuration (`astro.config.mjs`)

```javascript
vite: {
  define: {
    __GUILD_ID__: JSON.stringify('913492538516717578'),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}
```

## Development Workflow

### Current Development Process

1. Frontend development uses mock data exclusively
2. Backend API exists but frontend doesn't connect to it yet
3. Mock data provides realistic test scenarios
4. SSE simulation enables real-time feature development

### Testing Strategy

- **Unit Tests**: Vitest for individual functions
- **Integration Tests**: Testing React hooks with mock data
- **E2E Tests**: Planned but not yet implemented

## Migration Goals

### What We're Building Toward

1. **Dependency Injection**: Clean abstraction between mock and real APIs
2. **Environment Switching**: Vite variables control implementation selection
3. **Type Safety**: Shared package types ensure consistency
4. **Hot Swapping**: Development-mode runtime switching
5. **Zero Breaking Changes**: Existing React hooks continue working

### Success Criteria

- React hooks continue working unchanged
- Components receive identical data structures
- SSE simulation maintains same behavior
- Environment switching is transparent to UI layer
- Performance remains equivalent or better

## Key Constraints

### Type Safety Requirements

- **MUST** use types from `@ulti-project/shared` package
- **NO** local type definitions in implementation files
- TypeScript compiler enforces interface conformance

### Backward Compatibility Requirements

- **MUST** maintain identical function signatures
- **MUST** preserve SSE event structure and timing
- **MUST** keep existing React hook interfaces unchanged

### Performance Requirements

- **MUST** maintain current response times
- **SHOULD** not increase bundle size significantly
- **SHOULD** use lazy loading for implementation selection

This context provides the foundation for understanding the existing system and requirements for the migration phases.
