# Draft-Based Roster Management Workflow

## Overview

The roster management system now uses a **draft-based workflow** instead of individual slot assignment operations. This approach is more efficient, reduces API calls, and provides a better user experience.

## New Workflow

### 1. **Local Draft Building**

- Team leaders build rosters locally in the browser using session/local storage
- No API calls are made during the drafting process
- Draft state is preserved across browser sessions

### 2. **Draft Locks for Conflict Prevention**  

- Team leaders can "lock" participants they're considering
- Locks prevent other team leaders from selecting the same participants
- Locks expire automatically after 30 minutes
- Uses existing draft lock endpoints: `POST/DELETE /events/:eventId/locks`

### 3. **Atomic Publishing**

- When ready, team leader publishes the complete roster in one operation
- Uses existing `PUT /events/:eventId` endpoint with `roster` field
- All roster changes happen atomically - no partial states

### 4. **Real-time Updates**

- Other users see published roster changes via event streams
- Draft locks are released automatically when roster is published

## Benefits

### Performance

- Reduces API calls from potentially dozens to a single PUT request
- No need for optimistic locking on individual slots
- Faster UI since draft changes are local

### User Experience  

- Team leaders can experiment with different roster combinations
- Can save partial drafts without publishing
- Clear distinction between "draft" and "published" states

### Simplicity

- Eliminates complex slot-by-slot conflict resolution
- Single source of truth for roster state
- Easier to implement undo/redo functionality

## Removed Endpoints

The following endpoints are **no longer needed** and have been removed:

- ❌ `POST /events/:eventId/roster/assign`
- ❌ `DELETE /events/:eventId/roster/slots/:slotId`

## Implementation Details

### Frontend (Browser)

```typescript
// Build roster locally
const draft = {
  roster: {
    party: [
      { id: 'slot-1', role: 'Tank', assignedParticipant: selectedParticipant },
      // ... other slots
    ]
  }
};

// Save to session storage
sessionStorage.setItem(`draft-${eventId}`, JSON.stringify(draft));

// Publish when ready
await updateEvent(eventId, draft);
```

### Backend

```typescript
// Existing PUT /events/:eventId endpoint handles roster updates
PUT /events/event-123
{
  "roster": {
    "party": [
      { "id": "slot-1", "role": "Tank", "assignedParticipant": {...} }
    ]
  }
}
```

### Draft Locks

```typescript
// Lock a participant while considering them
await lockParticipant(eventId, teamLeaderId, {
  participantId: 'helper-1',
  participantType: 'helper'
});

// Locks are automatically released when roster is published
// or expire after 30 minutes
```

## Migration

### Mock Implementation ✅

- Removed `assignParticipant()` and `unassignParticipant()` functions
- Updated API exports to remove roster assignment types
- Existing `updateEvent()` function already supports roster updates

### API Specification ✅  

- Updated to reflect draft-based workflow
- Removed individual slot assignment endpoints
- Added explanation of roster management strategy

### Backend Implementation

- Remove roster assignment controller endpoints
- Remove roster service assignment methods  
- Keep draft lock system as-is
- Ensure `updateEvent` properly handles roster updates

This approach aligns better with real-world usage patterns where team leaders typically plan out complete rosters rather than making individual slot assignments.
