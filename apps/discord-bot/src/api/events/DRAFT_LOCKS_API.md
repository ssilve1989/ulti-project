# Draft Lock Management API

The Draft Lock Management API provides endpoints for managing participant locks during event roster drafting. This implements guild-based multi-tenancy with automatic cleanup of expired locks.

**Note**: All schemas and types for this API are defined in the shared package (`@ulti-project/shared`) for consistency across applications.

## Endpoints

### GET `/events/:eventId/locks`

Retrieve all active locks for an event.

**Query Parameters:**

- `guildId` (string, required): The guild ID

**Response:** Array of `DraftLock` objects

### POST `/events/:eventId/locks`

Create a new lock on a participant.

**Query Parameters:**

- `guildId` (string, required): The guild ID
- `teamLeaderId` (string, required): The team leader creating the lock

**Request Body:**

```json
{
  "participantType": "player" | "substitute",
  "participantId": "string"
}
```

**Response:** `DraftLock` object

**Errors:**

- `409 Conflict`: Participant is already locked by another team leader

### DELETE `/events/:eventId/locks/:participantType/:participantId`

Release a specific participant lock.

**Query Parameters:**

- `guildId` (string, required): The guild ID
- `teamLeaderId` (string, required): The team leader releasing the lock

**Response:**

```json
{
  "success": true
}
```

**Errors:**

- `404 Not Found`: Lock not found or not owned by the team leader

### DELETE `/events/:eventId/locks/team-leader/:teamLeaderId`

Release all locks held by a specific team leader.

**Query Parameters:**

- `guildId` (string, required): The guild ID

**Response:**

```json
{
  "success": true
}
```

### GET `/events/:eventId/locks/stream` (Server-Sent Events)

Real-time stream of lock updates for an event.

**Query Parameters:**

- `guildId` (string, required): The guild ID

**Stream Events:**

```json
{
  "data": {
    "type": "locks_updated",
    "data": [DraftLock]
  }
}
```

## Features

- **Automatic Expiration**: Locks automatically expire after 30 minutes
- **Conflict Detection**: Prevents multiple team leaders from locking the same participant
- **Real-time Updates**: SSE endpoint provides live updates using Firestore listeners for efficient real-time synchronization
- **Guild Isolation**: All operations are scoped to specific guilds for multi-tenancy
- **Efficient Streaming**: Uses Firestore real-time listeners instead of polling to minimize database reads
- **Guild Isolation**: Each guild's locks are completely separate
- **Cleanup**: Background cleanup of expired locks

## Example Usage

```javascript
// Create a lock
const response = await fetch('/events/event-123/locks?guildId=guild-456&teamLeaderId=leader-789', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    participantType: 'player',
    participantId: 'player-123'
  })
});

// Listen for real-time updates
const eventSource = new EventSource('/events/event-123/locks/stream?guildId=guild-456');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Lock update:', data);
};
```

## Implementation Details

- Uses Firebase Firestore for persistent storage
- Implements guild-based collection partitioning
- Includes comprehensive validation with Zod schemas
- Provides full TypeScript type safety
- Includes unit tests for all functionality
