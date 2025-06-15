# API Specification vs Mock Implementation Analysis

## Overview

This document identifies conflicts and discrepancies between the API specification in `API_SPECIFICATION.md` and the mock implementation in `/apps/website/src/lib/mock/`.

## Major Conflicts Found

### 1. **Roster Management Endpoint Signatures**

**API Spec:**

```typescript
POST /events/:eventId/roster/assign
Query Parameters: guildId, teamLeaderId
Request Body: { participantId, participantType, slotId, selectedJob }
```

**Mock Implementation:**

```typescript
assignParticipant(eventId: string, teamLeaderId: string, request: AssignParticipantRequest)
// Missing guildId parameter entirely
// teamLeaderId passed as function parameter, not query parameter
```

**Impact:** The mock doesn't match the REST endpoint structure defined in the spec.

### 2. **Event Deletion Parameters**

**API Spec:**

```typescript
DELETE /events/:eventId
Query Parameters: guildId (required), teamLeaderId (required)
```

**Mock Implementation:**

```typescript
deleteEvent(id: string, teamLeaderId: string)
// Missing guildId parameter
// teamLeaderId passed as function parameter instead of query parameter
```

### 3. **Missing Guild-Based Multi-tenancy**

**API Spec:** All endpoints require `guildId` for guild-based data isolation

**Mock Implementation:** No `guildId` parameters anywhere in the mock functions

**Impact:** The mock doesn't demonstrate the multi-tenant architecture that's core to the real API.

### 4. **GET /events Response Format Mismatch**

**API Spec:**

```typescript
Response: {
  events: ScheduledEvent[];
  total: number;
  hasMore: boolean;
}
```

**Mock Implementation:**

```typescript
getEvents(filters?: EventFilters): Promise<ScheduledEvent[]>
// Returns array directly, not wrapped object
```

### 5. **Missing Helper Endpoints in Mock**

**API Spec:** Defines specific helper endpoints:

- GET /helpers
- GET /helpers/:helperId  
- GET /helpers/:helperId/availability
- POST /helpers/:helperId/availability
- GET /helpers/:helperId/absences
- POST /helpers/:helperId/absences

**Mock Implementation:** Only has:

- getHelpers()
- isHelperAvailableForEvent()

**Impact:** Most helper-specific endpoints are missing from mock.

### 6. **Unassign Participant Endpoint Structure**

**API Spec:**

```typescript
DELETE /events/:eventId/roster/slots/:slotId
Query Parameters: guildId, teamLeaderId
```

**Mock Implementation:**

```typescript
unassignParticipant(eventId: string, teamLeaderId: string, slotId: string)
// slotId as function parameter instead of URL parameter
// Missing guildId
```

## Minor Conflicts

### 1. **Parameter Naming Inconsistencies**

**API Spec:** Uses `:helperId` in URLs
**Implementation:** Uses `:id` in actual backend

### 2. **Response Format Differences**

Some mock functions return data directly while the spec suggests wrapper objects for pagination.

## Mock Implementation Advantages

### 1. **Realistic Behavior**

- Includes proper error handling
- Simulates network delays
- Maintains state across calls
- Includes draft locking logic

### 2. **Complete Business Logic**

- Validates role compatibility
- Checks helper availability
- Implements concurrency controls
- Handles roster updates correctly

### 3. **Real-time Features**

- SSE simulation for draft locks
- Event broadcasting for roster changes
- Proper connection management

## Recommendations

### 1. **Align Mock with API Spec**

Update mock functions to match exact endpoint signatures:

```typescript
// Current
assignParticipant(eventId: string, teamLeaderId: string, request: AssignParticipantRequest)

// Should be
assignParticipant(eventId: string, guildId: string, teamLeaderId: string, request: AssignParticipantRequest)
```

### 2. **Add Missing Mock Endpoints**

Implement missing helper-specific endpoints in the mock to match the full API surface.

### 3. **Standardize Response Formats**

Ensure all mock responses match the pagination and wrapper formats defined in the spec.

### 4. **Update API Spec Implementation Status**

The spec marks roster endpoints as "❌ Not Implemented" but they exist in both mock and real backend.

### 5. **Add Guild ID Throughout**

Either add guildId to all mock functions or update the spec to clarify which endpoints truly need it.

## Conclusion

The mock implementation provides excellent business logic and realistic behavior, but has significant structural differences from the API specification. The main issue is that the mock was built as direct function calls rather than simulating REST endpoints, leading to parameter structure mismatches.

The real backend implementation appears to follow the API spec more closely than the mock does, which could cause confusion during frontend development.
