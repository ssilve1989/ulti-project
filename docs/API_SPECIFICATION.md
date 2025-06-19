# Ulti Project Scheduling API Specification

## Overview

This document outlines the REST API endpoints and real-time features needed for the Ulti Project scheduling system, based on the comprehensive mock implementation. The API supports multi-tenancy through guild-based data isolation, as the Discord bot operates across multiple Discord servers (guilds).

## Implementati#### **DELETE /events/:eventId/locks/team-leader/:teamLeaderId** ✅

Release all locks held by a specific team leader for an event

```typescript
Query Parameters:
- guildId: string (required)

Response: { success: true }
```

---

### 5. Real-time Updates (Server-Sent Events)s specification tracks the current implementation status of each endpoint

- ✅ **Implemented** - Endpoint is fully implemented and tested
- 🚧 **In Progress** - Implementation started but not complete  
- ❌ **Not Implemented** - Not yet started
- 📋 **Planned** - Documented but waiting for prerequisites

## Base URL

```
Production: https://api.ulti-project.com
Development: http://localhost:3001/api
```

## Authentication & Guild-Based Access Control

- All endpoints require authentication via JWT tokens or session-based auth
- **Guild-based isolation**: All data is scoped to specific Discord guild IDs
- Route-level authentication handles access control and guild membership validation
- Team leader validation happens at the route/middleware level, not in API logic
- Users can only access data for guilds they are members of

## Common Response Format

```typescript
// Success Response (HTTP 200-299)
T // Direct response data (event, participant array, etc.)

// Error Response (HTTP 400-599)
// The response body contains error details, but fetch() will reject/throw
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message", 
    "details": {} // Optional additional context
  }
}
```

## Error Handling Philosophy

- **HTTP status codes** indicate success/failure (200-299 = success, 400-599 = error)
- **Fetch calls reject** on error status codes (standard behavior)
- **Frontend uses try/catch** to handle API errors
- **Error responses** contain structured error information in the body
- **No wrapper objects** - success responses return data directly
- **Timestamps included in business objects** where needed (events have `lastModified`, `createdAt`)

## Data Models

### Core Types

```typescript
interface ScheduledEvent {
  id: string;
  name: string;
  encounter: 'FRU' | 'TOP' | 'DSR' | 'DRU' | 'TEA' | 'UCOB';
  scheduledTime: Date;
  duration: number; // minutes
  teamLeaderId: string;
  teamLeaderName: string;
  status: 'draft' | 'published' | 'in-progress' | 'completed' | 'cancelled';
  roster: EventRoster;
  createdAt: Date;
  lastModified: Date;
  version: number; // For optimistic locking
  // Note: guildId is not stored in the event object itself, but used for data isolation at the API level
}

interface EventRoster {
  party: PartySlot[];
  totalSlots: number;
  filledSlots: number;
}

interface PartySlot {
  id: string;
  role: 'Tank' | 'Healer' | 'DPS';
  jobRestriction?: Job;
  assignedParticipant?: Participant;
  isHelperSlot: boolean;
  draftedBy?: string;
  draftedAt?: Date;
}

interface Participant {
  type: 'helper' | 'progger';
  id: string;
  discordId: string;
  name: string;
  characterName?: string;
  job: Job;
  encounter?: 'FRU' | 'TOP' | 'DSR' | 'DRU' | 'TEA' | 'UCOB';
  progPoint?: string;
  availability?: string;
  isConfirmed: boolean;
}

interface HelperData {
  id: string;
  discordId: string;
  name: string;
  availableJobs: HelperJob[];
  weeklyAvailability?: HelperWeeklyAvailability[];
}

interface HelperWeeklyAvailability {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  timeRanges: HelperTimeRange[];
}

interface HelperTimeRange {
  start: string; // 24-hour format: "14:00"
  end: string;   // 24-hour format: "18:00"
  timezone?: string; // e.g., "America/New_York"
}

interface DraftLock {
  id: string;
  eventId: string;
  participantId: string;
  participantType: 'helper' | 'progger';
  lockedBy: string;
  lockedByName: string;
  lockedAt: Date;
  expiresAt: Date; // 30 minutes from lockedAt
}
```

---

## API Endpoints

### 1. Events Management

#### **GET /events** ✅

Get list of events with optional filtering

```typescript
Query Parameters:
- guildId: string (required)
- teamLeaderId?: string
- status?: 'draft' | 'published' | 'in-progress' | 'completed' | 'cancelled'
- encounter?: string
- dateFrom?: string (ISO date)
- dateTo?: string (ISO date)
- limit?: number (max 100, default 50)
- offset?: number (default 0)

Response: {
  events: ScheduledEvent[];
  total: number;
  hasMore: boolean;
}
```

#### **GET /events/:eventId** ✅

Get a specific event by ID

```typescript
Query Parameters:
- guildId: string (required)

Response: ScheduledEvent
```

#### **POST /events** ✅

Create a new event

```typescript
Request Body: {
  guildId: string;
  name: string;
  encounter: string;
  scheduledTime: Date;
  duration: number;
  teamLeaderId: string;
}

Response: ScheduledEvent
```

#### **PUT /events/:eventId** ✅

Update an existing event

```typescript
Query Parameters:
- guildId: string (required)

Request Body: {
  name?: string;
  scheduledTime?: Date;
  duration?: number;
  status?: ScheduledEvent['status'];
  roster?: EventRoster;
}

Response: ScheduledEvent
```

#### **DELETE /events/:eventId** ✅

Delete an event

```typescript
Query Parameters:
- guildId: string (required)
- teamLeaderId: string

Response: { success: true }
```

---

### 2. Participants Management

#### **GET /participants** ✅

Get all participants (helpers and proggers)

```typescript
Query Parameters:
- guildId: string (required)
- encounter?: string
- type?: 'helper' | 'progger'

Response: Participant[]
```

**Note**: When `type=progger` is specified, this returns approved signups from the Discord bot signup system. When `type=helper` is specified, this returns available helpers. When no type is specified, both helpers and proggers are returned.

#### **GET /helpers** ❌

Get all helpers

```typescript
Query Parameters:
- guildId: string (required)

Response: HelperData[]
```

#### **GET /helpers/:helperId** ❌

Get specific helper details

```typescript
Query Parameters:
- guildId: string (required)

Response: HelperData
```

---

### 3. Helper Availability

#### **GET /helpers/:helperId/availability** ❌

Check if a helper is available for a specific time

```typescript
Query Parameters:
- guildId: string (required)
- startTime: string (ISO datetime)
- endTime: string (ISO datetime)

Response: {
  available: boolean;
  reason?: 'absent' | 'outside_schedule' | 'available';
}
```

#### **POST /helpers/:helperId/availability** ❌

Set helper's weekly availability

```typescript
Query Parameters:
- guildId: string (required)

Request Body: {
  weeklyAvailability: HelperWeeklyAvailability[];
}

Response: HelperData
```

#### **GET /helpers/:helperId/absences** ❌

Get helper's absence periods

```typescript
Query Parameters:
- guildId: string (required)

Response: HelperAbsence[]
```

#### **POST /helpers/:helperId/absences** ❌

Create an absence period

```typescript
Query Parameters:
- guildId: string (required)

Request Body: {
  startDate: Date;
  endDate: Date;
  reason?: string;
}

Response: HelperAbsence
```

---

### 4. Draft Lock Management

The draft lock system allows team leaders to temporarily "reserve" participants while building their roster. This prevents conflicts when multiple team leaders are drafting simultaneously. The actual roster assignments happen through the event update endpoint when publishing a complete draft.

#### **GET /events/:eventId/locks** ✅

Get all active draft locks for an event

```typescript
Query Parameters:
- guildId: string (required)

Response: DraftLock[]
```

#### **POST /events/:eventId/locks** ✅

Create a draft lock on a participant

```typescript
Query Parameters:
- guildId: string (required)
- teamLeaderId: string

Request Body: {
  participantId: string;
  participantType: 'helper' | 'progger';
  slotId?: string;
}

Response: DraftLock
```

#### **DELETE /events/:eventId/locks/:participantType/:participantId** ✅

Release a draft lock

```typescript
Query Parameters:
- guildId: string (required)
- teamLeaderId: string

Response: { success: true }
```

#### **DELETE /events/:eventId/locks/team-leader/:teamLeaderId** ✅

Release all locks held by a team leader for an event

```typescript
Query Parameters:
- guildId: string (required)

Response: { success: true }
```

---

### 6. Real-time Updates (Server-Sent Events)

#### **GET /events/:eventId/stream** ❌

Real-time event updates

```typescript
Query Parameters:
- guildId: string (required)

Events:
- event_updated: { eventId, event, changes }
- participant_assigned: { eventId, slotId, participant, assignedBy }
- participant_unassigned: { eventId, slotId, assignedBy }

Content-Type: text/event-stream
```

#### **GET /participants/stream** ✅

Real-time participant updates (helpers and proggers)

```typescript
Query Parameters:
- guildId: string (required)
- type?: 'helper' | 'progger'

Events:
- participants_updated: Participant[]
- signup_approved: { participant: Participant }
- helper_availability_changed: { helperId, availability }

Content-Type: text/event-stream
```

**Note**: This unified stream includes both signup events (progger updates) and helper availability changes. The frontend can filter by participant type if needed.

#### **GET /events/:eventId/locks/stream** ✅

Real-time draft lock updates

```typescript
Query Parameters:
- guildId: string (required)

Events:
- locks_updated: DraftLock[]

Content-Type: text/event-stream
```

---

## Implementation Priorities

### Phase 1: Core Functionality ✅ COMPLETED

1. **Guild-based authentication** - ✅ Verify user membership and permissions per guild
2. **Events CRUD** - ✅ Basic event management with guild isolation
3. **Participants endpoints** - ✅ Helper and progger data scoped to guilds
4. **Basic roster management** - ❌ Assign/unassign without locking

### Phase 2: Advanced Features 🚧 IN PROGRESS

1. **Draft locking system** - ✅ Prevent concurrent assignment conflicts within guilds
2. **Helper availability** - ❌ Weekly schedules and absence management per guild
3. **Real-time updates** - 🚧 SSE streams for live collaboration per guild (partial)

### Phase 3: Optimization 📋 PLANNED

1. **Caching strategies** - ❌ Redis with guild-based cache keys
2. **Rate limiting** - ❌ Prevent abuse of real-time features per guild
3. **Monitoring** - ❌ Performance and error tracking with guild context

---

## Implementation Summary

### ✅ Completed Endpoints (13/15)

**Events Management (5/5)**

- ✅ GET /events
- ✅ GET /events/:eventId  
- ✅ POST /events
- ✅ PUT /events/:eventId (includes roster management via draft publish)
- ✅ DELETE /events/:eventId

**Participants Management (1/3)**

- ✅ GET /participants
- ❌ GET /helpers
- ❌ GET /helpers/:helperId

**Draft Lock Management (4/4)**

- ✅ GET /events/:eventId/locks
- ✅ POST /events/:eventId/locks
- ✅ DELETE /events/:eventId/locks/:participantType/:participantId
- ✅ DELETE /events/:eventId/locks/team-leader/:teamLeaderId

**Real-time Updates (2/3)**

- ❌ GET /events/:eventId/stream
- ✅ GET /participants/stream
- ✅ GET /events/:eventId/locks/stream

### ❌ Remaining Endpoints (2/15)

**Helper Availability (0/4)** - *Not yet prioritized*

- ❌ GET /helpers/:helperId/availability
- ❌ POST /helpers/:helperId/availability
- ❌ GET /helpers/:helperId/absences
- ❌ POST /helpers/:helperId/absences

**Additional Missing (2)**

- ❌ GET /helpers
- ❌ GET /helpers/:helperId
- ❌ GET /events/:eventId/stream

### Roster Management Strategy

**Draft-Based Workflow**: Instead of individual slot assignment endpoints, roster management is handled through:

1. **Local Draft Building**: Team leaders build rosters locally using session storage
2. **Conflict Prevention**: Draft locks prevent multiple leaders from selecting the same participants  
3. **Atomic Publishing**: Complete roster is submitted via `PUT /events/:eventId` when ready
4. **Real-time Updates**: Other users see published changes via event streams

This approach eliminates the need for:

- ❌ ~~POST /events/:eventId/roster/assign~~
- ❌ ~~DELETE /events/:eventId/roster/slots/:slotId~~

### Key Features Implemented

✅ **Guild-based Multi-tenancy**: All endpoints properly isolated by guild ID
✅ **Draft Locking System**: Prevents concurrent roster assignment conflicts  
✅ **Real-time Updates**: Firestore listeners for efficient live updates
✅ **Shared Schema Architecture**: Centralized validation schemas in shared package
✅ **Type Safety**: Full TypeScript support across frontend and backend
✅ **Error Handling**: Structured error responses with proper HTTP status codes

### Next Implementation Priorities

1. **Roster Management** - Core functionality for assigning participants to slots
2. **Helper System** - Support for helper availability and scheduling  
3. **Event Streaming** - Real-time updates for roster changes
4. **Helper Availability Management** - Weekly schedules and absence periods

The foundation is solid with events management, draft locking, and participant retrieval fully implemented. The next major milestone is implementing the roster assignment system to complete the core scheduling functionality.

---

## Error Codes

```typescript
// Guild errors
GUILD_NOT_FOUND = "Guild does not exist"
GUILD_ACCESS_DENIED = "User does not have access to this guild"
INVALID_GUILD_ID = "Guild ID is invalid or malformed"

// Event errors
EVENT_NOT_FOUND = "Event does not exist"
EVENT_IN_PROGRESS = "Cannot modify events that are in progress"
INVALID_EVENT_STATUS = "Invalid status transition"

// Participant errors  
PARTICIPANT_NOT_FOUND = "Participant does not exist"
PARTICIPANT_LOCKED = "Participant is locked by another team leader"
PARTICIPANT_UNAVAILABLE = "Participant is not available at this time"
SLOT_NOT_FOUND = "Roster slot does not exist"
SLOT_ALREADY_FILLED = "Roster slot is already assigned"

// Lock errors
LOCK_NOT_FOUND = "Draft lock does not exist"
LOCK_EXPIRED = "Draft lock has expired"
LOCK_HELD_BY_OTHER = "Lock is held by another team leader"

// Validation errors
INVALID_REQUEST = "Request validation failed"
MISSING_REQUIRED_FIELD = "Required field is missing"
INVALID_DATE_RANGE = "Invalid date range specified"
```

---

## Database Schema Considerations

### Tables Needed

1. **guilds** - Guild configuration and metadata
2. **events** - Core event data (with guildId foreign key)
3. **event_rosters** - Party and slot configurations  
4. **helpers** - Helper profiles and job capabilities (with guildId)
5. **helper_availability** - Weekly schedules and absence periods (with guildId)
6. **participants** (view) - Union of helpers and proggers per guild
7. **draft_locks** - Active participant locks (with TTL and guildId)
8. **event_audit_log** - Changes for debugging and history (with guildId)

### Key Relationships

- Guilds → Events (1:many)
- Guilds → Helpers (1:many)  
- Events → Rosters (1:1)
- Rosters → Slots (1:many)  
- Slots → Participants (many:1, nullable)
- Helpers → Availability (1:many)
- Events → Locks (1:many)

### Performance Considerations

- **Primary indexes**: All queries filtered by guildId first
- Index on `events.guildId, events.scheduledTime` for date-range queries
- Index on `helpers.guildId, helpers.discordId` for user lookups
- Index on `draft_locks.guildId, draft_locks.expiresAt` for cleanup jobs
- Consider guild-based database sharding for large deployments
- Cache helper availability calculations with guild-scoped cache keys
- Read replicas partitioned by guild for participant lookups

### Data Isolation Strategy

```sql
-- Example queries always include guildId for isolation
SELECT * FROM events WHERE guildId = ? AND scheduledTime BETWEEN ? AND ?;
SELECT * FROM helpers WHERE guildId = ? AND discordId = ?;
SELECT * FROM draft_locks WHERE guildId = ? AND expiresAt > NOW();
```

---

## Guild Management

### Frontend Guild Context

The frontend should maintain guild context throughout the application:

```typescript
// Astro global variable for current guild
const GUILD_ID = __GUILD_ID__; // '913492538516717578'

// All API calls include guildId
await createEvent({
  guildId: GUILD_ID,
  name: 'FRU Prog Session',
  // ... other fields
});
```

### Backend Guild Validation

```typescript
// Middleware example for guild access validation
async function validateGuildAccess(guildId: string, userId: string) {
  // Verify user is member of the guild
  const isMember = await checkGuildMembership(guildId, userId);
  if (!isMember) {
    throw new Error('GUILD_ACCESS_DENIED');
  }
}
```

---

This specification provides a complete roadmap for implementing the backend APIs with full guild-based multi-tenancy support, ensuring data isolation between Discord servers while maintaining the scheduling system's functionality.
