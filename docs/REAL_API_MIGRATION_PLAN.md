# Frontend API Migration Plan: Mock to Real API with React Query

## 1. Objective

This document outlines the strategy for transitioning the Ulti Project website frontend (located in `apps/website`) from its current mock API implementation to a real API backend. This migration will leverage `@tanstack/react-query` for robust data fetching, caching, and state management, while establishing a clear separation of concerns and a dependency injection mechanism to easily switch between mock and real API implementations during development and testing.

## 2. Current Mock Implementation Review

We acknowledge the existing mock data setup within the frontend application. This setup has served as a valuable contract and development accelerator. The goal is to retain the ability to use this mock layer while building out the real API integration.

**Important Note**: This project already has comprehensive API request/response types and Zod schemas defined in the `@ulti-project/shared` package (located at `packages/shared/src/schemas/api/`). These include:

- Event API schemas (`events.ts`)
- Helper API schemas (`helpers.ts`)
- Roster API schemas (`roster.ts`)
- Lock API schemas (`locks.ts`)
- Common schemas and error handling (`common.ts`, `errors.ts`)
- SSE event schemas (`sse.ts`)

All inferred TypeScript types are already exported from the shared package, eliminating the need to create new interface definitions. The migration will leverage these existing, well-defined contracts.

## 3. Proposed Architecture for API Interaction

To achieve a clean separation and enable easy switching, we will adopt the following architecture:

### 3.1. API Service Abstraction Layer

- **TypeScript Interfaces**: Define TypeScript interfaces for each API resource domain (e.g., `EventsApi`, `ParticipantsApi`, `DraftLockApi`, `HelperApi`). These interfaces will use the existing request/response types from `@ulti-project/shared` package, which already contains all the API schemas and inferred TypeScript types.

  - Location: `apps/website/src/lib/api/interfaces/`
  - Example (`apps/website/src/lib/api/interfaces/EventsApi.ts`):

        ```typescript
        import type {
          GetEventsQuery,
          GetEventsResponse,
          GetEventParams,
          GetEventQuery,
          GetEventResponse,
          CreateEventRequest,
          CreateEventResponse,
          UpdateEventParams,
          UpdateEventQuery,
          UpdateEventRequest,
          UpdateEventResponse,
          DeleteEventParams,
          DeleteEventQuery,
          DeleteEventResponse,
        } from '@ulti-project/shared';

        export interface EventsApi {
          getEvents(params: GetEventsQuery): Promise<GetEventsResponse>;
          getEventById(params: GetEventParams, query: GetEventQuery): Promise<GetEventResponse>;
          createEvent(params: CreateEventRequest): Promise<CreateEventResponse>;
          updateEvent(params: UpdateEventParams, query: UpdateEventQuery, body: UpdateEventRequest): Promise<UpdateEventResponse>;
          deleteEvent(params: DeleteEventParams, query: DeleteEventQuery): Promise<DeleteEventResponse>;
        }
        ```

### 3.2. Mock API Implementation

- Refactor the existing mock services to implement the newly defined API interfaces.
- Location: `apps/website/src/lib/api/mock/` (e.g., `apps/website/src/lib/api/mock/MockEventsApi.ts`).

### 3.3. Real API Implementation

- Create new service implementations that make actual HTTP requests to the backend API.
- These services will also implement the API interfaces.
- They will encapsulate the logic for making `fetch` calls (or using a library like `axios`).
- Location: `apps/website/src/lib/api/real/` (e.g., `apps/website/src/lib/api/real/EventsApi.ts`).
    - Example method:

            // apps/website/src/lib/api/real/EventsApi.ts
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

            class EventsApi implements EventsApi {
              private async makeRequest(endpoint: string, options: RequestInit = {}) {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                  credentials: 'include', // Include session cookies for better-auth
                  headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                  },
                  ...options,
                });

                if (!response.ok) {
                  // Handle structured error response from API spec
                  const errorData = await response.json();
                  throw new Error(errorData.error?.message || `API Error: ${response.status}`);
                }
                return response.json();
              }

              async getEvents(params: GetEventsQuery): Promise<GetEventsResponse> {
                const queryParams = new URLSearchParams();
                Object.entries(params).forEach(([key, value]) => {
                  if (value !== undefined && value !== null) {
                    queryParams.append(key, String(value));
                  }
                });

                return this.makeRequest(`/events?${queryParams.toString()}`);
              }
              // ... other methods
            }

### 3.4. API Client & Dependency Injection

- Create an API client module that exports the active API implementation (mock or real) based on an environment variable.
- This allows components and `react-query` hooks to consume the API services without being aware of the specific implementation.
- Location: `apps/website/src/lib/api/apiClient.ts`

        import { EventsApi } from './real/EventsApi';
        import { MockEventsApi } from './mock/MockEventsApi';
        import type { EventsApi } from './interfaces/EventsApi';
        // ... import other API interfaces and implementations

        const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

        export const eventsApi: EventsApi = useMockApi ? new MockEventsApi() : new EventsApi();
        export const helpersApi: HelpersApi = useMockApi ? new MockHelpersApi() : new HelpersApi();
        export const rosterApi: RosterApi = useMockApi ? new MockRosterApi() : new RosterApi();
        export const locksApi: LocksApi = useMockApi ? new MockLocksApi() : new LocksApi();
        // ... and so on for all API services

### 3.5. React Query Hooks

- Custom hooks will be created for interacting with the API via `react-query`. These hooks will use the API service instances exported by `apiClient.ts`.
- Location: `apps/website/src/hooks/api/` (e.g., `useEventsQuery.ts`, `useCreateEventMutation.ts`).

        // apps/website/src/hooks/api/useEventsQuery.ts
        import { useQuery } from '@tanstack/react-query';
        import { eventsApi } from '@/lib/api/apiClient';
        import type { GetEventsQuery } from '@ulti-project/shared';

        export const useEventsQuery = (params: GetEventsQuery, options?: any) => {
          return useQuery({
            queryKey: ['events', params],
            queryFn: () => eventsApi.getEvents(params),
            ...options
          });
        };

## 4. Migration Steps

1. **Setup `QueryClient` and Provider**:
    - Initialize `QueryClient` and wrap the application with `QueryClientProvider` in the main Astro layout or root component (e.g., `apps/website/src/layouts/Layout.astro` or a shared React component).

        ```astro
        ---
        // apps/website/src/layouts/Layout.astro
        import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
        import { ReactQueryDevtools } from '@tanstack/react-query-devtools'; // For client-side React components

        const queryClient = new QueryClient();
        // If using Astro components primarily, QueryClientProvider might be used within client-side React islands.
        // If a global React root exists, wrap it there.
        // For Astro, you might need a client-side script to initialize this for React components.
        // This example assumes React components will manage their own provider context if not global.
        // A common pattern is a <GlobalProviders client:only="react"> component.
        ---
        <html lang="en">
          <head>...</head>
          <body>
            {/* If you have a root React component, wrap it here: */}
            {/* <QueryClientProvider client={queryClient}> */}
            {/*   <ReactQueryDevtools initialIsOpen={false} /> */}
            {/*   <slot /> */}
            {/* </QueryClientProvider> */}
            <slot /> {/* Placeholder: Actual setup depends on Astro + React integration pattern */}
          </body>
        </html>
        ```

        A more robust setup for Astro + React involves a wrapper component for React islands:

        ```tsx
        // apps/website/src/components/QueryProvider.tsx
        import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
        import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
        import type { PropsWithChildren } from 'react';

        const queryClient = new QueryClient();

        export function QueryProvider({ children }: PropsWithChildren<{}>) {
          return (
            <QueryClientProvider client={queryClient}>
              {children}
              <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
          );
        }
        ```

        Then use this provider in your Astro layouts or pages where React components are used.

2. **Define API Service Interfaces**:
    - Create TypeScript interfaces for all API resources (Events, Helpers, Roster, Locks) that use the existing types from `@ulti-project/shared` package.
    - Store in `apps/website/src/lib/api/interfaces/`. These interfaces will define the contract for API service implementations.

3. **Implement Real API Services/Functions**:
    - Create the "real" API service classes (e.g., `EventsApi`, `HelpersApi`) in `apps/website/src/lib/api/real/`.
    - These services will implement the API interfaces and make actual HTTP requests to the backend API.
    - Import and use the Zod schemas from `@ulti-project/shared` for request/response validation.

4. **Refactor Mock API Services/Functions**:
    - Update existing mock API services to implement the new interfaces and use the types from `@ulti-project/shared`.
    - Store in `apps/website/src/lib/api/mock/`.

5. **Implement API Client (DI Layer)**:
    - Create `apps/website/src/lib/api/apiClient.ts` to export either mock or real API service instances based on `VITE_USE_MOCK_API`.

6. **Create `react-query` Hooks**:
    - Develop custom hooks (e.g., `useEventsQuery`, `useCreateEventMutation`) in `apps/website/src/hooks/api/`. These hooks will use the API service instances from `apiClient.ts` and `react-query`'s `useQuery`/`useMutation`.

7. **Update UI Components**:
    - Gradually refactor UI components to use the new `react-query` hooks instead of directly calling mock services.
    - Ensure components correctly handle loading, success, and error states provided by the hooks.

8. **Handle Real-time Updates (SSE)**:
    - For SSE endpoints (`/events/:eventId/stream`, `/participants/stream`, `/events/:eventId/locks/stream`):
        - Implement client-side logic using the `EventSource` API to connect to these streams.
        - On receiving updates, use `queryClient.setQueryData` to update the relevant `react-query` cache or `queryClient.invalidateQueries` to trigger refetches.
        - The mock implementation for SSE will need to simulate these events (e.g., using `setTimeout` or manual triggers).

9. **Authentication**:
    - The project already uses `better-auth` for authentication with session-based cookies.
    - **Frontend**: The `authClient` from `apps/website/src/lib/auth.ts` automatically includes credentials with `fetchOptions: { credentials: 'include' }`.
    - **API Service Implementation**: Real API service classes should include session cookies in requests by ensuring `credentials: 'include'` is set in fetch options.
    - **Backend Verification**: The backend already has:
      - `AuthService.getSession()` method that extracts session from request headers using `better-auth/node`
      - `AuthGuard` that validates sessions and attaches user info to the request
      - Session validation via `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })`
    - **Implementation Strategy**:
      - Real API services should use the same fetch configuration as the auth client (with credentials included)
      - Backend API endpoints can use the existing `@UseGuards(AuthGuard)` decorator for protection
      - Protected endpoints will automatically have access to `request.user` containing session user data

10. **Testing**:
    - Update unit/integration tests. Tests can be configured to run against the mock API layer by setting `VITE_USE_MOCK_API=true`.
    - Consider tests for the real API service classes by mocking the `fetch` call itself (e.g., using `msw` - Mock Service Worker).

## 5. Key Considerations

- **Error Handling**:
  - Real API functions must parse structured error responses from the backend.
  - `react-query` hooks will propagate these errors, which UI components must handle gracefully.
- **Environment Variables**:
  - `VITE_API_BASE_URL`: For the real API's base URL (e.g., `https://api.ulti-project.com` or `http://localhost:3001/api`).
  - `VITE_USE_MOCK_API` (boolean string: `'true'` or `'false'`): To switch between API implementations.
  - Document these in `apps/website/.env.example` and ensure they are loaded correctly in the Astro project.
- **Guild ID Management**:
  - The `guildId` is a crucial parameter for nearly all API calls. Ensure it's consistently and correctly passed from the frontend's context (e.g., from a global store, URL parameter, or Astro props).
- **Optimistic Updates**:
  - Utilize `react-query`'s optimistic update capabilities for mutations to enhance user experience (e.g., immediately reflecting a change in the UI while the API request is in progress).
- **Data Transformation**:
  - Handle any necessary data transformations (e.g., date formatting) either within the API functions or using `react-query`'s `select` option in hooks.
- **Code Organization**:
  - `apps/website/src/lib/api/`:
    - `interfaces/`: TypeScript interfaces that use types from `@ulti-project/shared`.
    - `real/`: Real API service classes.
    - `mock/`: Mock API service classes.
    - `apiClient.ts`: DI logic.
  - `apps/website/src/hooks/api/`: Custom `react-query` hooks.
- **`react-query` Configuration**:
  - **Query Keys**: Adopt a consistent and predictable strategy for query keys (e.g., `['events', { guildId, ...filters }]`, `['event', eventId]`).
  - **Stale Time & Cache Time**: Configure default stale and cache times via `QueryClient` if the defaults are not suitable.
  - **Devtools**: Ensure `@tanstack/react-query-devtools` is set up for development.

## 6. Phased Rollout (Optional)

The migration can be done feature by feature or resource by resource:

1. Start with read-only operations for one resource (e.g., `GET /events`).
2. Implement mutations for that resource (e.g., `POST /events`, `PUT /events/:eventId`).
3. Move to the next resource (e.g., Participants).
4. Implement SSE integrations last or in parallel where appropriate.

This phased approach allows for incremental testing and reduces the risk of a large, disruptive change.

## 7. Documentation Updates

- Update any relevant frontend development documentation to reflect the new API integration strategy, `react-query` usage, and how to use the `VITE_USE_MOCK_API` flag.
- Document the structure of API-related files and hooks.

This plan provides a comprehensive roadmap for migrating to the real API, ensuring maintainability, testability, and an improved developer experience with `react-query`.
