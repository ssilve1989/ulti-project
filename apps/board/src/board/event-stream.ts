import type {
  BoardEvent,
  BoardParticipant,
  BoardStreamMessage,
} from '@ulti-project/shared';
import { createSignal, onCleanup } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { api } from '../api/client';
import { isAccessRefusal } from '../shell/shell-context';

type StreamState =
  | { kind: 'connecting' }
  | { kind: 'live'; event: BoardEvent }
  | { kind: 'reconnecting'; event: BoardEvent }
  | { kind: 'not-found' }
  | { kind: 'refused' };

export interface EventStream {
  readonly state: () => StreamState;
  /** Applies a participant the client already knows the server holds (a claim's 200 or 409), or an optimistic change. */
  readonly putParticipant: (participant: BoardParticipant) => void;
  /** The participant as currently shown, if any. */
  readonly participant: (id: string) => BoardParticipant | undefined;
}

/** Opens `/api/events/:id/stream` for the current owner; closed on cleanup. */
export function createEventStream(
  eventId: string,
  deps?: { readonly reconnectDelayMs?: number },
): EventStream {
  const reconnectDelayMs = deps?.reconnectDelayMs ?? 5000;
  // Without a board yet, 'live' and 'reconnecting' read as connecting.
  const [phase, setPhase] = createSignal<
    'live' | 'reconnecting' | 'not-found' | 'refused'
  >('reconnecting');
  const [board, setBoard] = createStore<{ event?: BoardEvent }>({});
  let source: EventSource;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function upsert(participant: BoardParticipant, insert: boolean): void {
    setBoard(
      produce(({ event }) => {
        const existing = event?.participants.find(
          (row) => row.id === participant.id,
        );
        // Assigning in place keeps the row's identity, so only its cells re-render.
        if (existing) Object.assign(existing, participant);
        else if (insert) event?.participants.push(participant);
      }),
    );
  }

  function connect(): void {
    source = new EventSource(`/api/events/${eventId}/stream`);
    source.onmessage = (message) => {
      // The stream's one trust point: the server only sends BoardStreamMessage JSON.
      const data: BoardStreamMessage = JSON.parse(message.data);
      switch (data.type) {
        case 'snapshot':
          setBoard('event', reconcile(data.event, { key: 'id' }));
          setPhase('live');
          break;
        case 'participant-upserted':
          upsert(data.participant, true);
          break;
        case 'participant-removed':
          setBoard(
            produce(({ event }) => {
              if (event)
                event.participants = event.participants.filter(
                  (row) => row.id !== data.participantId,
                );
            }),
          );
          break;
      }
    };
    source.onerror = () => {
      setPhase('reconnecting');
      // CONNECTING: the browser retries by itself, and a fresh snapshot follows.
      if (source.readyState !== EventSource.CLOSED) return;
      source.close();
      void api<BoardEvent>(`/api/events/${eventId}`).then((result) => {
        if (disposed) return;
        if (!result.ok && result.status === 404) setPhase('not-found');
        else if (!result.ok && isAccessRefusal(result)) setPhase('refused');
        else reconnect = setTimeout(connect, reconnectDelayMs);
      });
    };
  }

  connect();
  onCleanup(() => {
    disposed = true;
    source.close();
    clearTimeout(reconnect);
  });

  return {
    state: () => {
      const kind = phase();
      if (kind === 'not-found' || kind === 'refused') return { kind };
      return board.event
        ? { kind, event: board.event }
        : { kind: 'connecting' };
    },
    putParticipant: (participant) => upsert(participant, false),
    participant: (id) => board.event?.participants.find((row) => row.id === id),
  };
}
