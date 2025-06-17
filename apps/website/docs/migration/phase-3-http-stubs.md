# Phase 3: HTTP API Stubs

**Duration**: 1-2 days  
**Complexity**: Low  
**Dependencies**: Phase 1 (API Interfaces)

## 🎯 Phase Goals

Create HTTP-based API implementation stubs that will be ready for real backend integration. These implementations will initially throw "Not implemented" errors but provide the proper structure for future development.

## 📋 Context

At this phase, we have:

- ✅ API interfaces defined (Phase 1)
- ✅ Mock implementations working (Phase 2)
- 🎯 Need HTTP stubs for real API integration

The HTTP implementations will:

- Implement the same interfaces as mock implementations
- Use proper HTTP client configuration  
- Include authentication, error handling, and retry logic
- Initially throw errors but be ready for backend integration

## 🔧 Implementation Steps

### 3.1 Create Base HTTP API Class

Create the foundation for all HTTP API implementations.

**File**: `src/lib/api/implementations/http/BaseHttpApi.ts`

```typescript
import type { ApiError } from '@ulti-project/shared';

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export abstract class BaseHttpApi {
  protected readonly config: HttpClientConfig;
  
  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: 5000,
      retries: 3,
      ...config,
    };
  }

  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const requestConfig: RequestInit = {
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, requestConfig);
      
      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }
      
      return await response.json();
    } catch (error) {
      throw this.handleRequestError(error);
    }
  }

  protected async handleErrorResponse(response: Response): Promise<ApiError> {
    const errorData = await response.json().catch(() => ({}));
    
    return {
      code: response.status,
      message: errorData.message || response.statusText,
      details: errorData.details,
    };
  }

  protected handleRequestError(error: unknown): ApiError {
    if (error instanceof Error) {
      return {
        code: 0,
        message: error.message,
        details: { originalError: error.name },
      };
    }
    
    return {
      code: 0,
      message: 'Unknown error occurred',
      details: { originalError: String(error) },
    };
  }
}
```

### 3.2 Create HTTP Events API

**File**: `src/lib/api/implementations/http/HttpEventsApi.ts`

```typescript
import type {
  CreateEventRequest,
  ScheduledEvent,
  EventFilters,
  UpdateEventRequest,
} from '@ulti-project/shared';
import type { IEventsApi } from '../../interfaces/IEventsApi.js';
import { BaseHttpApi } from './BaseHttpApi.js';

export class HttpEventsApi extends BaseHttpApi implements IEventsApi {
  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    throw new Error('HttpEventsApi.createEvent not implemented - backend integration required');
    
    // Future implementation:
    // return this.request<ScheduledEvent>('/api/events', {
    //   method: 'POST',
    //   body: JSON.stringify(request),
    // });
  }

  async getEvent(id: string): Promise<ScheduledEvent | null> {
    throw new Error('HttpEventsApi.getEvent not implemented - backend integration required');
    
    // Future implementation:
    // try {
    //   return await this.request<ScheduledEvent>(`/api/events/${id}`);
    // } catch (error) {
    //   if (error.code === 404) return null;
    //   throw error;
    // }
  }

  async getEvents(filters?: EventFilters): Promise<ScheduledEvent[]> {
    throw new Error('HttpEventsApi.getEvents not implemented - backend integration required');
    
    // Future implementation:
    // const params = new URLSearchParams();
    // if (filters?.status) params.set('status', filters.status);
    // if (filters?.startDate) params.set('startDate', filters.startDate);
    // if (filters?.endDate) params.set('endDate', filters.endDate);
    // 
    // const queryString = params.toString();
    // const endpoint = queryString ? `/api/events?${queryString}` : '/api/events';
    // 
    // return this.request<ScheduledEvent[]>(endpoint);
  }

  async updateEvent(id: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
    throw new Error('HttpEventsApi.updateEvent not implemented - backend integration required');
    
    // Future implementation:
    // return this.request<ScheduledEvent>(`/api/events/${id}`, {
    //   method: 'PATCH',
    //   body: JSON.stringify(updates),
    // });
  }

  async deleteEvent(id: string, teamLeaderId: string): Promise<void> {
    throw new Error('HttpEventsApi.deleteEvent not implemented - backend integration required');
    
    // Future implementation:
    // await this.request<void>(`/api/events/${id}`, {
    //   method: 'DELETE',
    //   headers: {
    //     'X-Team-Leader-ID': teamLeaderId,
    //   },
    // });
  }

  createEventStream(eventId: string): EventSource {
    throw new Error('HttpEventsApi.createEventStream not implemented - backend integration required');
    
    // Future implementation:
    // const url = `${this.config.baseUrl}/api/events/${eventId}/stream`;
    // return new EventSource(url);
  }
}
```

### 3.3 Create HTTP Helpers API

**File**: `src/lib/api/implementations/http/HttpHelpersApi.ts`

```typescript
import type {
  HelperData,
  HelperAbsence,
  CreateHelperAbsenceRequest,
} from '@ulti-project/shared';
import type { IHelpersApi } from '../../interfaces/IHelpersApi.js';
import { BaseHttpApi } from './BaseHttpApi.js';

export class HttpHelpersApi extends BaseHttpApi implements IHelpersApi {
  async getHelper(helperId: string): Promise<HelperData | null> {
    throw new Error('HttpHelpersApi.getHelper not implemented - backend integration required');
  }

  async getHelpers(): Promise<HelperData[]> {
    throw new Error('HttpHelpersApi.getHelpers not implemented - backend integration required');
  }

  async getHelperAbsences(helperId: string): Promise<HelperAbsence[]> {
    throw new Error('HttpHelpersApi.getHelperAbsences not implemented - backend integration required');
  }

  async createHelperAbsence(request: CreateHelperAbsenceRequest): Promise<HelperAbsence> {
    throw new Error('HttpHelpersApi.createHelperAbsence not implemented - backend integration required');
  }

  async updateHelperAbsence(absenceId: string, updates: Partial<HelperAbsence>): Promise<HelperAbsence> {
    throw new Error('HttpHelpersApi.updateHelperAbsence not implemented - backend integration required');
  }

  async deleteHelperAbsence(absenceId: string): Promise<void> {
    throw new Error('HttpHelpersApi.deleteHelperAbsence not implemented - backend integration required');
  }

  createHelpersStream(): EventSource {
    throw new Error('HttpHelpersApi.createHelpersStream not implemented - backend integration required');
  }
}
```

### 3.4 Create HTTP Roster API

**File**: `src/lib/api/implementations/http/HttpRosterApi.ts`

```typescript
import type {
  AssignParticipantRequest,
  Participant,
  UnassignParticipantRequest,
} from '@ulti-project/shared';
import type { IRosterApi } from '../../interfaces/IRosterApi.js';
import { BaseHttpApi } from './BaseHttpApi.js';

export class HttpRosterApi extends BaseHttpApi implements IRosterApi {
  async assignParticipant(request: AssignParticipantRequest): Promise<Participant> {
    throw new Error('HttpRosterApi.assignParticipant not implemented - backend integration required');
  }

  async unassignParticipant(request: UnassignParticipantRequest): Promise<void> {
    throw new Error('HttpRosterApi.unassignParticipant not implemented - backend integration required');
  }

  async getEventParticipants(eventId: string): Promise<Participant[]> {
    throw new Error('HttpRosterApi.getEventParticipants not implemented - backend integration required');
  }

  createRosterStream(eventId: string): EventSource {
    throw new Error('HttpRosterApi.createRosterStream not implemented - backend integration required');
  }
}
```

### 3.5 Create HTTP Locks API

**File**: `src/lib/api/implementations/http/HttpLocksApi.ts`

```typescript
import type {
  DraftLock,
  LockParticipantRequest,
  UnlockParticipantRequest,
} from '@ulti-project/shared';
import type { ILocksApi } from '../../interfaces/ILocksApi.js';
import { BaseHttpApi } from './BaseHttpApi.js';

export class HttpLocksApi extends BaseHttpApi implements ILocksApi {
  async lockParticipant(request: LockParticipantRequest): Promise<DraftLock> {
    throw new Error('HttpLocksApi.lockParticipant not implemented - backend integration required');
  }

  async unlockParticipant(request: UnlockParticipantRequest): Promise<void> {
    throw new Error('HttpLocksApi.unlockParticipant not implemented - backend integration required');
  }

  async getEventLocks(eventId: string): Promise<DraftLock[]> {
    throw new Error('HttpLocksApi.getEventLocks not implemented - backend integration required');
  }

  async renewLock(lockId: string): Promise<DraftLock> {
    throw new Error('HttpLocksApi.renewLock not implemented - backend integration required');
  }

  createLocksStream(eventId: string): EventSource {
    throw new Error('HttpLocksApi.createLocksStream not implemented - backend integration required');
  }
}
```

### 3.6 Update Factory to Include HTTP Implementations

**File**: `src/lib/api/factory.ts` (update existing)

```typescript
// Add to existing imports
import { HttpEventsApi } from './implementations/http/HttpEventsApi.js';
import { HttpHelpersApi } from './implementations/http/HttpHelpersApi.js';
import { HttpRosterApi } from './implementations/http/HttpRosterApi.js';
import { HttpLocksApi } from './implementations/http/HttpLocksApi.js';
import type { HttpClientConfig } from './implementations/http/BaseHttpApi.js';

// Update createApiClient function
export function createApiClient(): ApiClient {
  const useMock = import.meta.env.VITE_USE_MOCK_API === 'true';
  
  if (useMock) {
    return {
      events: new MockEventsApi(),
      helpers: new MockHelpersApi(),
      roster: new MockRosterApi(),
      locks: new MockLocksApi(),
    };
  }
  
  // HTTP implementations
  const httpConfig: HttpClientConfig = {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
    timeout: 10000,
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_API_TOKEN || ''}`,
    },
  };
  
  return {
    events: new HttpEventsApi(httpConfig),
    helpers: new HttpHelpersApi(httpConfig),
    roster: new HttpRosterApi(httpConfig),
    locks: new HttpLocksApi(httpConfig),
  };
}
```

### 3.7 Create HTTP Implementation Barrel Export

**File**: `src/lib/api/implementations/http/index.ts`

```typescript
export { BaseHttpApi } from './BaseHttpApi.js';
export { HttpEventsApi } from './HttpEventsApi.js';
export { HttpHelpersApi } from './HttpHelpersApi.js';
export { HttpRosterApi } from './HttpRosterApi.js';
export { HttpLocksApi } from './HttpLocksApi.js';
export type { HttpClientConfig } from './BaseHttpApi.js';
```

## ✅ Validation Criteria

### Completion Requirements

- [ ] All HTTP API classes created and implement their respective interfaces
- [ ] BaseHttpApi provides proper error handling and request configuration
- [ ] All methods throw clear "not implemented" errors with helpful messages
- [ ] Factory updated to create HTTP implementations when mock mode is disabled
- [ ] TypeScript compilation passes without errors
- [ ] All imports use proper ESM module syntax

### Testing Validation

```typescript
// Test that HTTP implementations can be instantiated
import { createApiClient } from '../lib/api/factory.js';

// Temporarily set environment to use HTTP
const originalEnv = import.meta.env.VITE_USE_MOCK_API;
import.meta.env.VITE_USE_MOCK_API = 'false';

const apiClient = createApiClient();
console.assert(apiClient.events.constructor.name === 'HttpEventsApi');

// Restore environment
import.meta.env.VITE_USE_MOCK_API = originalEnv;
```

### Error Handling Test

```typescript
// Test that HTTP methods throw appropriate errors
try {
  await apiClient.events.getEvents();
  console.error('Should have thrown not implemented error');
} catch (error) {
  console.assert(error.message.includes('not implemented'));
}
```

## 🔄 Next Steps

After completing this phase:

1. **Verify all HTTP stubs are created and working**
2. **Test that factory properly switches between implementations**
3. **Ensure TypeScript types are correct for all HTTP methods**
4. **Proceed to [Phase 4: API Client Update](./phase-4-client-update.md)**

## ⚠️ Important Notes

- **Don't implement actual HTTP logic yet** - these are just stubs for structure
- **Maintain consistent error messages** - they help with debugging during development
- **All HTTP implementations should have the same method signatures** as mock implementations
- **Consider authentication and authorization patterns** for future implementation
- **HTTP client configuration should be environment-aware** for different deployment stages

---

**Phase Dependencies**: ✅ Phase 1 (API Interfaces)  
**Next Phase**: [Phase 4: API Client Update](./phase-4-client-update.md)
