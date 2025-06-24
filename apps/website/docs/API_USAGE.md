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