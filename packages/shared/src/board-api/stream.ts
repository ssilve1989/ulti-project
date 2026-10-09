import type { BoardEvent, BoardParticipant } from './events.ts';

/**
 * A message on `GET /api/events/:id/stream`, as each SSE message's JSON
 * `data`. The first is always a `snapshot`; an event-level change sends a
 * fresh one. The server also sends a `: ping` comment every 25s, which
 * `EventSource` ignores.
 */
export type BoardStreamMessage =
  | { type: 'snapshot'; event: BoardEvent }
  | { type: 'participant-upserted'; participant: BoardParticipant }
  | { type: 'participant-removed'; participantId: string };
