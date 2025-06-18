import { ParticipantType } from '@ulti-project/shared';
import type {
  ConflictError,
  DraftLock,
  LockParticipantRequest,
} from '@ulti-project/shared';
import { isBefore } from 'date-fns';
import { MOCK_CONFIG, delay } from './config.js';

// In-memory draft locks storage
const activeLocks = new Map<string, DraftLock>();
let lockIdCounter = 1;

// SSE connections for draft updates
const draftConnections = new Map<string, Set<(event: MessageEvent) => void>>();

// Team leader names for display
const teamLeaderNames = new Map<string, string>([
  ['leader-1', 'TeamAlpha'],
  ['leader-2', 'TeamBeta'],
  ['leader-3', 'TeamGamma'],
  ['leader-4', 'TeamDelta'],
]);

// Auto-expire locks after timeout
setInterval(() => {
  const now = new Date();
  const expiredLocks: DraftLock[] = [];

  for (const [lockId, lock] of activeLocks.entries()) {
    if (isBefore(new Date(lock.expiresAt), now)) {
      activeLocks.delete(lockId);
      expiredLocks.push(lock);
    }
  }

  // Broadcast expired locks
  for (const lock of expiredLocks) {
    broadcastLockEvent(lock.eventId, {
      type: 'draft_lock_expired',
      data: { eventId: lock.eventId, lock },
      timestamp: new Date(),
    });
  }
}, 60000); // Check every minute

// Broadcast lock events to all connections for an event
function broadcastLockEvent(eventId: string, event: any): void {
  const connections = draftConnections.get(eventId);
  if (!connections) return;

  const message = new MessageEvent('message', {
    data: JSON.stringify(event),
  });

  for (const callback of connections) {
    callback(message);
  }
}

// API Functions
export async function lockParticipant(
  eventId: string,
  teamLeaderId: string,
  request: LockParticipantRequest,
): Promise<DraftLock> {
  await delay(MOCK_CONFIG.delays.fast);

  // Check for existing lock
  const existingLock = Array.from(activeLocks.values()).find(
    (lock) =>
      lock.participantId === request.participantId &&
      lock.participantType === request.participantType,
  );

  if (existingLock && existingLock.lockedBy !== teamLeaderId) {
    const error: ConflictError = {
      code: 'CONFLICT',
      message: 'Participant is already locked by another team leader',
      conflictType: 'being_drafted',
      conflictDetails: {
        currentHolder: existingLock.lockedByName,
        lockExpiresAt: existingLock.expiresAt,
        conflictingEventId: existingLock.eventId,
      },
    };
    throw error;
  }

  // If same team leader, extend the lock
  if (existingLock && existingLock.lockedBy === teamLeaderId) {
    existingLock.expiresAt = new Date(
      Date.now() + MOCK_CONFIG.draftTimeout,
    ).toISOString();

    broadcastLockEvent(eventId, {
      type: 'draft_lock_extended',
      data: { eventId, lock: existingLock },
      timestamp: new Date(),
    });

    return existingLock;
  }

  // Create new lock
  const lock: DraftLock = {
    id: `lock-${lockIdCounter++}`,
    eventId,
    participantId: request.participantId,
    participantType: request.participantType,
    lockedBy: teamLeaderId,
    lockedByName: teamLeaderNames.get(teamLeaderId) || `Leader-${teamLeaderId}`,
    lockedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + MOCK_CONFIG.draftTimeout).toISOString(),
  };

  activeLocks.set(lock.id, lock);

  // Broadcast new lock
  broadcastLockEvent(eventId, {
    type: 'draft_lock_created',
    data: { eventId, lock },
    timestamp: new Date(),
  });

  return lock;
}

export async function releaseLock(
  eventId: string,
  teamLeaderId: string,
  participantId: string,
  participantType: ParticipantType,
): Promise<void> {
  await delay(MOCK_CONFIG.delays.fast);

  const lock = Array.from(activeLocks.values()).find(
    (l) =>
      l.participantId === participantId &&
      l.participantType === participantType &&
      l.lockedBy === teamLeaderId,
  );

  if (!lock) {
    throw new Error('Lock not found or not owned by this team leader');
  }

  activeLocks.delete(lock.id);

  // Broadcast lock release
  broadcastLockEvent(eventId, {
    type: 'draft_lock_released',
    data: { eventId, lock },
    timestamp: new Date(),
  });
}

export async function getActiveLocks(eventId?: string): Promise<DraftLock[]> {
  await delay(MOCK_CONFIG.delays.fast);

  const locks = Array.from(activeLocks.values());

  if (eventId) {
    return locks.filter((lock) => lock.eventId === eventId);
  }

  return locks;
}

export async function getParticipantLock(
  participantId: string,
  participantType: ParticipantType,
): Promise<DraftLock | null> {
  await delay(MOCK_CONFIG.delays.fast);

  const lock = Array.from(activeLocks.values()).find(
    (l) =>
      l.participantId === participantId &&
      l.participantType === participantType,
  );

  return lock || null;
}

export async function isParticipantLocked(
  participantId: string,
  participantType: ParticipantType,
  excludeTeamLeader?: string,
): Promise<boolean> {
  await delay(MOCK_CONFIG.delays.fast);

  const lock = await getParticipantLock(participantId, participantType);

  if (!lock) return false;
  if (excludeTeamLeader && lock.lockedBy === excludeTeamLeader) return false;

  return true;
}

// Release all locks for a team leader (when they disconnect or cancel)
export async function releaseAllLocksForTeamLeader(
  teamLeaderId: string,
  eventId?: string,
): Promise<void> {
  await delay(MOCK_CONFIG.delays.fast);

  const locksToRelease = Array.from(activeLocks.values()).filter(
    (lock) =>
      lock.lockedBy === teamLeaderId && (!eventId || lock.eventId === eventId),
  );

  for (const lock of locksToRelease) {
    activeLocks.delete(lock.id);

    broadcastLockEvent(lock.eventId, {
      type: 'draft_lock_released',
      data: { eventId: lock.eventId, lock },
      timestamp: new Date(),
    });
  }
}

// SSE Stream for draft updates
export function createDraftLocksEventSource(eventId: string): EventSource {
  const mockEventSource = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onopen: null as ((event: Event) => void) | null,
    readyState: 1, // OPEN
    url: `/mock/events/${eventId}/locks`,
    withCredentials: false,
    CONNECTING: 0,
    OPEN: 1,
    CLOSED: 2,
    close: () => {
      const connections = draftConnections.get(eventId);
      if (connections && mockEventSource.onmessage) {
        connections.delete(mockEventSource.onmessage);
        if (connections.size === 0) {
          draftConnections.delete(eventId);
        }
      }
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') {
        mockEventSource.onmessage = listener as (event: MessageEvent) => void;
        if (mockEventSource.onmessage) {
          if (!draftConnections.has(eventId)) {
            draftConnections.set(eventId, new Set());
          }
          draftConnections.get(eventId)!.add(mockEventSource.onmessage);
        }
      }
    },
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as EventSource;

  // Send initial locks data
  setTimeout(async () => {
    if (mockEventSource.onmessage) {
      const locks = await getActiveLocks(eventId);
      const event = new MessageEvent('message', {
        data: JSON.stringify({
          type: 'initial_locks',
          data: { eventId, locks },
          timestamp: new Date(),
        }),
      });
      mockEventSource.onmessage(event);
    }
  }, 100);

  return mockEventSource;
}

// Utility functions
export function getLocksByTeamLeader(teamLeaderId: string): DraftLock[] {
  return Array.from(activeLocks.values()).filter(
    (lock) => lock.lockedBy === teamLeaderId,
  );
}

export function getLocksByEvent(eventId: string): DraftLock[] {
  return Array.from(activeLocks.values()).filter(
    (lock) => lock.eventId === eventId,
  );
}

// Simulate some random lock activity for demo purposes
if (MOCK_CONFIG && typeof window !== 'undefined') {
  setInterval(() => {
    // Randomly create some demo locks
    if (Math.random() < 0.1 && activeLocks.size < 5) {
      // 10% chance, max 5 locks
      const demoEventId = 'demo-event-1';
      const demoTeamLeader = 'leader-2';
      const demoParticipantId = `demo-participant-${Math.floor(Math.random() * 10)}`;

      lockParticipant(demoEventId, demoTeamLeader, {
        participantId: demoParticipantId,
        participantType:
          Math.random() < 0.5
            ? ParticipantType.Helper
            : ParticipantType.Progger,
      }).catch(() => {
        // Ignore conflicts in demo
      });
    }
  }, 10000); // Every 10 seconds
}
