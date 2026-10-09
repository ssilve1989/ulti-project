// @vitest-environment jsdom
import type { BoardEvent } from '@ulti-project/shared';
import { createRoot } from 'solid-js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { json, stubApi } from '../test-utils/api-stub';
import {
  type FakeEventSource,
  installFakeEventSource,
} from '../test-utils/fake-event-source';
import { boardEvent, participant } from '../test-utils/fixtures';
import { createEventStream, type EventStream } from './event-stream';

const STREAM_URL = '/api/events/event-1/stream';

/** Opens the stream in its own root, disposed when the test ends. */
function openStream(): {
  stream: EventStream;
  dispose: () => void;
  source: FakeEventSource;
  sources: readonly FakeEventSource[];
} {
  const sources = installFakeEventSource();
  const { stream, dispose } = createRoot((dispose) => ({
    stream: createEventStream('event-1'),
    dispose,
  }));
  onTestFinished(dispose);
  const [source] = sources;
  if (source === undefined) throw new Error('No EventSource was opened');
  return { stream, dispose, source, sources };
}

const aeryn = Object.freeze(
  participant({ discordId: 'p1', character: 'Aeryn Vail' }),
);
const bricktop = Object.freeze(
  participant({ discordId: 'p2', character: 'Bricktop' }),
);

describe('a new event stream', () => {
  it('opens the event stream and is connecting', () => {
    const { stream, sources } = openStream();

    expect(sources.map((source) => source.url)).toEqual([STREAM_URL]);
    expect(stream.state()).toEqual({ kind: 'connecting' });
  });
});

describe('stream messages', () => {
  it('shows the snapshot live, then applies upserts and removals by id', () => {
    const { stream, source } = openStream();
    const live = (participants: BoardEvent['participants']) => ({
      kind: 'live',
      event: boardEvent({ participants }),
    });

    source.open();
    source.send({
      type: 'snapshot',
      event: boardEvent({ participants: [aeryn] }),
    });
    expect(stream.state()).toEqual(live([aeryn]));

    source.send({ type: 'participant-upserted', participant: bricktop });
    expect(stream.state()).toEqual(live([aeryn, bricktop]));

    const claimed = {
      ...aeryn,
      claim: {
        squadId: 'squad-froge',
        claimedBy: 'lead-1',
        claimedAt: '2026-10-09T18:00:00.000Z',
      },
    };
    source.send({ type: 'participant-upserted', participant: claimed });
    expect(stream.state()).toEqual(live([claimed, bricktop]));

    source.send({ type: 'participant-removed', participantId: aeryn.id });
    expect(stream.state()).toEqual(live([bricktop]));
  });

  it('replaces the board with a fresh snapshot', () => {
    const { stream, source } = openStream();
    source.open();
    source.send({
      type: 'snapshot',
      event: boardEvent({ participants: [aeryn] }),
    });

    const renamed = boardEvent({ title: 'Sunday FRU', status: 'closed' });
    source.send({ type: 'snapshot', event: renamed });

    expect(stream.state()).toEqual({ kind: 'live', event: renamed });
  });
});

describe('the server ends the stream', () => {
  it('shows the last board as reconnecting until the next snapshot', () => {
    const { stream, source } = openStream();
    source.open();
    source.send({ type: 'snapshot', event: boardEvent() });

    source.drop();
    expect(stream.state()).toEqual({
      kind: 'reconnecting',
      event: boardEvent(),
    });

    const fresh = boardEvent({ participants: [aeryn] });
    source.open();
    source.send({ type: 'snapshot', event: fresh });
    expect(stream.state()).toEqual({ kind: 'live', event: fresh });
  });
});

describe('the reconnect is refused', () => {
  function dropAndRefuse(): EventStream {
    const { stream, source } = openStream();
    source.open();
    source.send({ type: 'snapshot', event: boardEvent() });
    source.drop();
    source.refuse();
    return stream;
  }

  it.each([
    ['403 no-role', 'refused', json(403, { reason: 'no-role' })],
    ['401', 'refused', json(401, { reason: 'signed-out' })],
    ['404', 'not-found', json(404, { reason: 'not-found' })],
  ])('after the event answers %s, is %s', async (_, kind, response) => {
    stubApi({ 'GET /api/events/event-1': response });
    const stream = dropAndRefuse();

    await vi.waitFor(() => expect(stream.state()).toEqual({ kind }));
  });

  it('after the event answers 500, stays reconnecting and opens a new stream 5s later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { sent } = stubApi({
      'GET /api/events/event-1': json(500, { reason: 'internal' }),
    });
    const { stream, sources, source } = openStream();
    source.open();
    source.send({ type: 'snapshot', event: boardEvent() });
    source.drop();
    source.refuse();
    // interval 0: waitFor advances fake timers by its interval on every check.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1), { interval: 0 });

    expect(stream.state()).toEqual({
      kind: 'reconnecting',
      event: boardEvent(),
    });
    expect(sent.map((request) => request.path)).toEqual([
      '/api/events/event-1',
    ]);
    vi.advanceTimersByTime(4999);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(
      sources.map((source) => ({ url: source.url, closed: source.closed })),
    ).toEqual([
      { url: STREAM_URL, closed: true },
      { url: STREAM_URL, closed: false },
    ]);
  });
});

describe('disposing the root', () => {
  it('closes the stream', () => {
    const { dispose, source } = openStream();
    source.open();

    dispose();

    expect(source.closed).toBe(true);
  });

  it('cancels a pending reconnect', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubApi({ 'GET /api/events/event-1': json(500, { reason: 'internal' }) });
    const { dispose, sources, source } = openStream();
    source.refuse();
    // interval 0: waitFor advances fake timers by its interval on every check.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1), { interval: 0 });

    dispose();
    vi.advanceTimersByTime(5000);

    expect(sources).toHaveLength(1);
  });
});
