# Phase 3: HTTP API Implementation

**Duration**: 1-2 days  
**Complexity**: Medium  
**Dependencies**: Phase 2 (Enhanced Mock Implementations)

## Overview

**Goal**: Create production-ready HTTP API implementations that implement the same interfaces as the enhanced mock system.

**Strategy**: Build complete HTTP clients with authentication, error handling, and retry logic that match the interface contracts from Phase 1.

## 🔄 Implementation Tasks

### Task Overview

Phase 3 is broken down into **4 granular tasks** that must be completed sequentially:

1. **Task 3.1**: Create base HTTP client infrastructure
2. **Task 3.2**: Implement HTTP API classes for each domain
3. **Task 3.3**: Add authentication and error handling
4. **Task 3.4**: Create HTTP implementation factory

Each task builds production-ready HTTP functionality.

---

## Task 3.1: Create Base HTTP Client Infrastructure

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Phase 2 complete

### Inputs

- Phase 1 interface definitions
- HTTP client requirements (authentication, retry, error handling)
- Environment configuration patterns

### Outputs

- Base HTTP client with full production features
- Error handling and retry logic
- Authentication support

### Implementation

**Step 3.1.1**: Create base HTTP client

> **🔒 AUTHENTICATION NOTE**: This project uses BetterAuth with cookie-based authentication, not Bearer tokens. The HTTP client must include `credentials: 'include'` to send cookies with requests. No Authorization headers are needed.

**File**: `src/lib/api/implementations/http/BaseHttpClient.ts` (CREATE NEW)

```typescript
import type { ApiError } from '@ulti-project/shared';

// NOTE: Cookie-based authentication setup
// - No token parameter in config (removed)
// - No Authorization header setup (removed) 
// - Must include credentials: 'include' in fetch requests
// - EventSource must use withCredentials: true

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

export class BaseHttpClient {
  protected readonly config: HttpClientConfig;
  
  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: 10000,
      retries: 3,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...config,
    };
  }

  protected async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.params);
    const requestInit = this.buildRequestInit(options);
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.retries!; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, requestInit);
        
        if (!response.ok) {
          throw await this.handleHttpError(response);
        }
        
        const result = await response.json();
        return result as T;
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retries! && this.shouldRetry(error as Error)) {
          await this.delay(Math.pow(2, attempt) * 1000);
          continue;
        }
        
        break;
      }
    }
    
    throw lastError!;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    
    return url.toString();
  }

  private buildRequestInit(options: RequestOptions): RequestInit {
    const headers = {
      ...this.config.headers,
      ...options.headers,
    };

    const init: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body) {
      init.body = JSON.stringify(options.body);
    }

    return init;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleHttpError(response: Response): Promise<ApiError> {
    let errorData: any = {};

    try {
      errorData = await response.json();
    } catch {
      // Response body is not JSON
    }

    const apiError: ApiError = {
      code: response.status.toString(),
      message: errorData.message || response.statusText || 'HTTP request failed',
      details: errorData.details || undefined,
    };

    return new Error(JSON.stringify(apiError));
  }

  private shouldRetry(error: Error): boolean {
    // Retry on network errors and 5xx status codes
    if (error.name === 'AbortError') return false; // Don't retry timeouts

    try {
      const apiError = JSON.parse(error.message) as ApiError;
      const statusCode = parseInt(apiError.code);
      return statusCode >= 500 && statusCode < 600;
    } catch {
      // Network error or other non-API error
      return true;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Server-Sent Events support
  protected createEventSource(path: string, params?: Record<string, string>): EventSource {
    const url = this.buildUrl(path, params);
    const headers: Record<string, string> = {};

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    
    // Note: EventSource doesn't support custom headers directly
    // In production, authentication might need to be handled via query params or cookies
    return new EventSource(url);
  }
}
```

### Acceptance Criteria - Task 3.1

- [ ] Base HTTP client with timeout and retry logic
- [ ] Cookie-based authentication support (credentials: 'include')
- [ ] Comprehensive error handling
- [ ] Exponential backoff retry strategy
- [ ] NO Authorization headers (uses BetterAuth cookies)
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify base client created
ls -la apps/website/src/lib/api/implementations/http/BaseHttpClient.ts

# Test TypeScript compilation
pnpm --filter website run type-check

# Verify class structure
grep -n "class BaseHttpClient" apps/website/src/lib/api/implementations/http/BaseHttpClient.ts
```

### File Operations

- **CREATE**: `src/lib/api/implementations/http/BaseHttpClient.ts`
- **NO CHANGES**: All other files remain unchanged

---

## Task 3.2: Implement HTTP API Classes

**Duration**: 60 minutes  
**Complexity**: High  
**Dependencies**: Task 3.1 complete

### Inputs

- Base HTTP client from Task 3.1
- Phase 1 interface definitions
- API endpoint specifications

### Outputs

- Complete HTTP API implementations for all domains
- Full CRUD operations with proper error handling

### Implementation

**Step 3.2.1**: Create Events HTTP API

**File**: `src/lib/api/implementations/http/EventsApi.ts` (CREATE NEW)

```typescript
import type { IEventsApi, IApiContext, IPaginatedResponse } from '../../interfaces/index.js';
import type {
  ScheduledEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventFilters,
  EventStatus
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpEventsApi extends BaseHttpClient implements IEventsApi {
  constructor(
    config: { baseUrl: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async createEvent(request: CreateEventRequest): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'POST',
      path: `/api/events`,
      body: { ...request, guildId: this.context.guildId }
    });
  }

  async getEvent(eventId: string): Promise<ScheduledEvent | null> {
    try {
      return await this.request<ScheduledEvent>({
        method: 'GET',
        path: `/api/events/${eventId}`,
        params: { guildId: this.context.guildId }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 404')) {
        return null;
      }
      throw error;
    }
  }

  async getEvents(filters?: EventFilters): Promise<IPaginatedResponse<ScheduledEvent>> {
    const params: Record<string, string> = {
      guildId: this.context.guildId
    };
    
    if (filters?.startDate) params.startDate = filters.startDate;
    if (filters?.endDate) params.endDate = filters.endDate;
    if (filters?.status) params.status = filters.status;
    if (filters?.encounter) params.encounter = filters.encounter;

    const response = await this.request<{
      events: ScheduledEvent[];
      total: number;
      hasMore: boolean;
      nextCursor?: string;
    }>({
      method: 'GET',
      path: `/api/events`,
      params
    });

    return {
      data: response.events,
      total: response.total,
      hasMore: response.hasMore,
      nextCursor: response.nextCursor
    };
  }

  async updateEvent(eventId: string, updates: UpdateEventRequest): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'PUT',
      path: `/api/events/${eventId}`,
      body: { ...updates, guildId: this.context.guildId }
    });
  }

  async deleteEvent(eventId: string, teamLeaderId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/events/${eventId}`,
      params: { guildId: this.context.guildId, teamLeaderId }
    });
  }

  async updateEventStatus(eventId: string, status: EventStatus): Promise<ScheduledEvent> {
    return this.updateEvent(eventId, { status });
  }

  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<ScheduledEvent[]> {
    const response = await this.getEvents({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    return response.data;
  }
}
```

**Step 3.2.2**: Create Helpers HTTP API

**File**: `src/lib/api/implementations/http/HelpersApi.ts` (CREATE NEW)

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
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpHelpersApi extends BaseHttpClient implements IHelpersApi {
  constructor(
    config: { baseUrl: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async getHelpers(): Promise<HelperData[]> {
    return this.request<HelperData[]>({
      method: 'GET',
      path: `/api/helpers`,
      params: { guildId: this.context.guildId }
    });
  }

  async getHelper(helperId: string): Promise<HelperData | null> {
    try {
      return await this.request<HelperData>({
        method: 'GET',
        path: `/api/helpers/${helperId}`,
        params: { guildId: this.context.guildId }
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 404')) {
        return null;
      }
      throw error;
    }
  }

  async checkHelperAvailability(request: CheckHelperAvailabilityRequest): Promise<HelperAvailabilityResponse> {
    return this.request<HelperAvailabilityResponse>({
      method: 'POST',
      path: `/api/helpers/${request.helperId}/availability`,
      params: { guildId: this.context.guildId },
      body: {
        startTime: request.startTime.toISOString(),
        endTime: request.endTime.toISOString()
      }
    });
  }

  async getHelperAvailability(helperId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return this.request<any[]>({
      method: 'GET',
      path: `/api/helpers/${helperId}/availability`,
      params: {
        guildId: this.context.guildId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
  }

  async createAbsence(helperId: string, absence: CreateAbsenceRequest): Promise<HelperAbsence> {
    return this.request<HelperAbsence>({
      method: 'POST',
      path: `/api/helpers/${helperId}/absences`,
      params: { guildId: this.context.guildId },
      body: {
        ...absence,
        startDate: absence.startDate.toISOString(),
        endDate: absence.endDate.toISOString()
      }
    });
  }

  async getAbsences(helperId: string, startDate?: Date, endDate?: Date): Promise<HelperAbsence[]> {
    const params: Record<string, string> = {
      guildId: this.context.guildId
    };
    if (startDate) params.startDate = startDate.toISOString();
    if (endDate) params.endDate = endDate.toISOString();

    return this.request<HelperAbsence[]>({
      method: 'GET',
      path: `/api/helpers/${helperId}/absences`,
      params
    });
  }

  async deleteAbsence(helperId: string, absenceId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/helpers/${helperId}/absences/${absenceId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async getHelpersByJobRole(jobs?: Job[], roles?: Role[]): Promise<HelperData[]> {
    const params: Record<string, string> = {};
    if (jobs) params.jobs = jobs.join(',');
    if (roles) params.roles = roles.join(',');

    return this.request<HelperData[]>({
      method: 'GET',
      path: `/api/guilds/${this.context.guildId}/helpers`,
      params
    });
  }
}
```

**Step 3.2.3**: Create Roster HTTP API

**File**: `src/lib/api/implementations/http/RosterApi.ts` (CREATE NEW)

```typescript
import type { IRosterApi, IApiContext } from '../../interfaces/index.js';
import type {
  ScheduledEvent,
  AssignParticipantRequest,
  UnassignParticipantRequest
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpRosterApi extends BaseHttpClient implements IRosterApi {
  constructor(
    config: { baseUrl: string; token?: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async assignParticipant(
    eventId: string,
    teamLeaderId: string,
    request: AssignParticipantRequest
  ): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'POST',
      path: `/api/events/${eventId}/roster/assign`,
      params: { 
        guildId: this.context.guildId,
        teamLeaderId 
      },
      body: request
    });
  }

  async unassignParticipant(
    eventId: string,
    slotId: string,
    teamLeaderId: string
  ): Promise<ScheduledEvent> {
    return this.request<ScheduledEvent>({
      method: 'DELETE',
      path: `/api/events/${eventId}/roster/slots/${slotId}`,
      params: { 
        guildId: this.context.guildId,
        teamLeaderId 
      }
    });
  }
}
```

**Step 3.2.4**: Create Locks HTTP API

**File**: `src/lib/api/implementations/http/LocksApi.ts` (CREATE NEW)

```typescript
import type { ILocksApi, IApiContext } from '../../interfaces/index.js';
import type {
  DraftLock,
  CreateDraftLockRequest
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpLocksApi extends BaseHttpClient implements ILocksApi {
  constructor(
    config: { baseUrl: string; token?: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async getEventLocks(eventId: string): Promise<DraftLock[]> {
    return this.request<DraftLock[]>({
      method: 'GET',
      path: `/api/events/${eventId}/locks`,
      params: { guildId: this.context.guildId }
    });
  }

  async createLock(eventId: string, request: CreateDraftLockRequest): Promise<DraftLock> {
    return this.request<DraftLock>({
      method: 'POST',
      path: `/api/events/${eventId}/locks`,
      params: { guildId: this.context.guildId },
      body: request
    });
  }

  async releaseLock(
    eventId: string,
    participantType: string,
    participantId: string
  ): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/events/${eventId}/locks/${participantType}/${participantId}`,
      params: { guildId: this.context.guildId }
    });
  }

  async releaseAllLocks(eventId: string, teamLeaderId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/api/events/${eventId}/locks/team-leader/${teamLeaderId}`,
      params: { guildId: this.context.guildId }
    });
  }

  getEventLocksStream(eventId: string): EventSource {
    const url = new URL(`/api/events/${eventId}/locks/stream`, this.config.baseUrl);
    url.searchParams.set('guildId', this.context.guildId);
    
    return new EventSource(url.toString(), {
      withCredentials: true
    });
  }
}
```

**Step 3.2.5**: Create Participants HTTP API  

**File**: `src/lib/api/implementations/http/ParticipantsApi.ts` (CREATE NEW)

```typescript
import type { IParticipantsApi, IApiContext } from '../../interfaces/index.js';
import type {
  Participant,
  GetParticipantsQuery
} from '@ulti-project/shared';
import { BaseHttpClient } from './BaseHttpClient.js';

export class HttpParticipantsApi extends BaseHttpClient implements IParticipantsApi {
  constructor(
    config: { baseUrl: string; token?: string },
    public readonly context: IApiContext
  ) {
    super(config);
  }

  async getParticipants(query?: GetParticipantsQuery): Promise<Participant[]> {
    const params = {
      guildId: this.context.guildId,
      ...query
    };

    return this.request<Participant[]>({
      method: 'GET',
      path: `/api/participants`,
      params
    });
  }

  getParticipantsStream(query?: GetParticipantsQuery): EventSource {
    const url = new URL(`/api/participants/stream`, this.config.baseUrl);
    url.searchParams.set('guildId', this.context.guildId);
    
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }
    
    return new EventSource(url.toString(), {
      withCredentials: true
    });
  }
}
```

### Acceptance Criteria

- [ ] Complete HTTP API implementations for Events and Helpers
- [ ] Proper error handling with 404 null returns
- [ ] Date serialization using toISOString()
- [ ] Guild context in all API paths
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify HTTP API files created
ls -la apps/website/src/lib/api/implementations/http/

# Test TypeScript compilation
pnpm --filter website run type-check

# Verify API endpoint paths
grep -n "/api/events\|/api/helpers\|/api/participants" apps/website/src/lib/api/implementations/http/*.ts
```

### File Operations

- **CREATE**: `src/lib/api/implementations/http/EventsApi.ts`
- **CREATE**: `src/lib/api/implementations/http/HelpersApi.ts`
- **CREATE**: `src/lib/api/implementations/http/RosterApi.ts`
- **CREATE**: `src/lib/api/implementations/http/LocksApi.ts`

---

## Task 3.3: Add Authentication and Error Handling

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 3.2 complete

### Inputs

- HTTP API implementations from Task 3.2
- Authentication requirements
- Error handling patterns

### Outputs

- Enhanced error handling with proper API error types
- Token refresh logic
- Request/response interceptors

### Implementation

**Step 3.3.1**: Create API error types

**File**: `src/lib/api/implementations/http/errors.ts` (CREATE NEW)

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(status: number, data: any): ApiError {
    return new ApiError(
      data.message || `HTTP ${status} Error`,
      status,
      data.code,
      data.details
    );
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }
}
```

**Step 3.3.2**: Update base client with enhanced error handling

**File**: `src/lib/api/implementations/http/BaseHttpClient.ts` (MODIFY existing handleHttpError method)

```typescript
import { ApiError } from './errors.js';

// Update the handleHttpError method
private async handleHttpError(response: Response): Promise<ApiError> {
  try {
    const errorData = await response.json();
    return ApiError.fromResponse(response.status, errorData);
  } catch {
    return new ApiError(
      response.statusText || 'Unknown error',
      response.status
    );
  }
}
```

### Acceptance Criteria

- [ ] Proper ApiError class with status code handling
- [ ] Enhanced error responses from HTTP client
- [ ] Error categorization methods (isNotFound, etc.)
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify error handling files
ls -la apps/website/src/lib/api/implementations/http/errors.ts

# Test error class
grep -n "class ApiError" apps/website/src/lib/api/implementations/http/errors.ts

# Test compilation
pnpm --filter website run type-check
```

### File Operations

- **CREATE**: `src/lib/api/implementations/http/errors.ts`
- **MODIFY**: `src/lib/api/implementations/http/BaseHttpClient.ts`

---

## Task 3.4: Create HTTP Implementation Factory

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 3.3 complete

### Inputs

- All HTTP API implementations
- Factory pattern from Phase 1
- Environment configuration

### Outputs

- Complete HTTP implementation factory
- Environment-based configuration

### Implementation

**Step 3.4.1**: Create HTTP factory implementation

**File**: `src/lib/api/implementations/http/index.ts` (CREATE NEW)

```typescript
import type { ISchedulingApi, IApiContext } from '../../interfaces/index.js';
import { HttpEventsApi } from './EventsApi.js';
import { HttpHelpersApi } from './HelpersApi.js';
import { HttpRosterApi } from './RosterApi.js';
import { HttpLocksApi } from './LocksApi.js';

export class HttpSchedulingApi implements ISchedulingApi {
  public readonly events: HttpEventsApi;
  public readonly helpers: HttpHelpersApi;
  public readonly roster: HttpRosterApi;
  public readonly locks: HttpLocksApi;

  constructor(baseUrl: string, token: string | undefined, context: IApiContext) {
    const config = { baseUrl, token };
    
    this.events = new HttpEventsApi(config, context);
    this.helpers = new HttpHelpersApi(config, context);
    this.roster = new HttpRosterApi(config, context);
    this.locks = new HttpLocksApi(config, context);
  }
}

export function createHttpSchedulingApi(
  baseUrl: string,
  token: string | undefined,
  context: IApiContext
): ISchedulingApi {
  return new HttpSchedulingApi(baseUrl, token, context);
}
```

### Acceptance Criteria

- [ ] HTTP scheduling API factory created
- [ ] All domain APIs properly instantiated
- [ ] Configuration passed to all implementations
- [ ] Factory function exports main API
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Verify HTTP factory created
ls -la apps/website/src/lib/api/implementations/http/index.ts

# Verify factory exports
grep -n "createHttpSchedulingApi" apps/website/src/lib/api/implementations/http/index.ts

# Test compilation
pnpm --filter website run type-check
```

### File Operations

- **CREATE**: `src/lib/api/implementations/http/index.ts`

---

## Phase 3 Completion Validation

### Final Acceptance Criteria

- [ ] All 4 tasks completed successfully
- [ ] Complete HTTP API implementations created
- [ ] Production-ready error handling and retry logic
- [ ] Authentication support with Bearer tokens
- [ ] Factory pattern matches interface contracts
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Final Validation Commands

```bash
# Comprehensive validation
pnpm --filter website run type-check
pnpm --filter website run build

# Verify HTTP implementation structure
find apps/website/src/lib/api/implementations/http -name "*.ts" | sort

# Verify all API classes created
grep -r "class Http.*Api" apps/website/src/lib/api/implementations/http/
```

### Files Created

**New Files:**

- `src/lib/api/implementations/http/BaseHttpClient.ts`
- `src/lib/api/implementations/http/EventsApi.ts`
- `src/lib/api/implementations/http/HelpersApi.ts`
- `src/lib/api/implementations/http/RosterApi.ts`
- `src/lib/api/implementations/http/LocksApi.ts`
- `src/lib/api/implementations/http/errors.ts`
- `src/lib/api/implementations/http/index.ts`

### Ready for Phase 4

HTTP implementations now ready for Phase 4 client integration.

## 🔒 Authentication Implementation Summary

**CRITICAL FOR AI AGENT**: This project uses BetterAuth with cookie-based authentication, NOT Bearer tokens. The following must be implemented correctly:

### Key Changes from Default HTTP Client Patterns

1. **NO Authorization Headers**:
   - Remove `token?: string` from `HttpClientConfig`
   - Remove Authorization header setup in constructor
   - No Bearer token handling anywhere

2. **Cookie-Based Authentication**:
   - Add `credentials: 'include'` to ALL fetch requests
   - This sends BetterAuth session cookies automatically
   - Server validates session from cookies, not headers

3. **EventSource Configuration**:
   - Use `withCredentials: true` for Server-Sent Events
   - No custom authentication headers needed

4. **Error Handling**:
   - 401 errors indicate session expired or invalid
   - No token refresh logic needed (cookies handled by browser)

### Implementation Checklist

- [ ] `HttpClientConfig` has no token parameter
- [ ] `BaseHttpClient` constructor sets no Authorization headers  
- [ ] `buildRequestInit()` includes `credentials: 'include'`
- [ ] `createEventSource()` uses `withCredentials: true`
- [ ] All API class constructors expect `{ baseUrl: string }` only
- [ ] No token passing in any HTTP API implementations

This approach leverages the existing BetterAuth setup in the discord-bot backend and the authClient configuration in the website frontend.

---

**Phase Dependencies**: ✅ Phase 1 (API Interfaces)  
**Next Phase**: [Phase 4: API Client Integration](./phase-4-client-update.md)
