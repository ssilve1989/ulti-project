import { Readable } from 'node:stream';
import type { Agent } from 'supertest';

/** One server-sent event as the client receives it, with its `data` parsed as JSON if it is. */
interface SseFrame {
  readonly id?: string;
  readonly event?: string;
  readonly data?: unknown;
  readonly comment?: string;
}

/**
 * An open event stream: `next()` resolves to its next event, or `done` once
 * the server has ended it. `close()` disconnects, as a browser leaving does.
 */
interface SseStream extends AsyncIterator<SseFrame, undefined> {
  close(): Promise<void>;
}

/** `data` as JSON, or as sent if it isn't: Nest sends an error's message as is. */
function parsed(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

/** The event in a block of SSE lines, or undefined for a block with no fields. */
function parseFrame(block: string): SseFrame | undefined {
  const fields = new Map<string, string[]>();
  for (const line of block.split('\n')) {
    if (line === '') continue;
    const colon = line.indexOf(':');
    const name = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    fields.set(name, [...(fields.get(name) ?? []), value]);
  }
  if (fields.size === 0) return undefined;
  const one = (name: string) => fields.get(name)?.join('\n');
  const data = one('data');
  const frame: SseFrame = {
    id: one('id'),
    event: one('event'),
    data: data === undefined ? undefined : parsed(data),
    comment: one(''),
  };
  return Object.fromEntries(
    Object.entries(frame).filter(([, value]) => value !== undefined),
  );
}

/**
 * Opens `path` as an event stream on `agent`, with its cookies, as a
 * browser's `EventSource` does. Rejects unless the server answers 200 with
 * `text/event-stream`. Closing the app ends it, as a browser sees when the
 * server drops the connection.
 */
function openSse(agent: Agent, path: string): Promise<SseStream> {
  const frames: SseFrame[] = [];
  const waiting: ((result: IteratorResult<SseFrame, undefined>) => void)[] = [];
  let ended = false;
  let body: Readable | undefined;
  let markClosed = () => {};
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });
  const deliver = () => {
    while (waiting.length > 0 && (frames.length > 0 || ended)) {
      const frame = frames.shift();
      waiting.shift()?.(
        frame === undefined
          ? { done: true, value: undefined }
          : { done: false, value: frame },
      );
    }
  };

  const request = agent
    .get(path)
    .set('Accept', 'text/event-stream')
    .buffer(false)
    .parse((response, callback) => {
      if (!(response instanceof Readable)) {
        callback(new Error('expected a streamed response'), undefined);
        return;
      }
      body = response;
      let pending = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        const blocks = (pending + chunk).split('\n\n');
        pending = blocks.pop() ?? '';
        for (const block of blocks) {
          const frame = parseFrame(block);
          if (frame) frames.push(frame);
        }
        deliver();
      });
      response.once('end', () => {
        ended = true;
        deliver();
        callback(null, undefined);
      });
      const close = () => {
        ended = true;
        deliver();
        markClosed();
      };
      response.once('close', close);
      // the server dropping the connection (it shut down) ends the stream
      // too; the interceptor's socket reports that as an `aborted` error,
      // without a `close`
      response.on('error', close);
    });
  // sends it; the response arrives as 'response'
  request.end(() => {});

  return new Promise((resolve, reject) => {
    request.once('response', (response) => {
      // superagent re-emits the raw response's errors here; the parser's
      // listener already ends the stream on one
      response.on('error', () => {});
      const type = response.headers['content-type'];
      if (
        response.status !== 200 ||
        typeof type !== 'string' ||
        !type.startsWith('text/event-stream')
      ) {
        reject(
          new Error(
            `expected ${path} to open an event stream, but it answered ${response.status} ${type}`,
          ),
        );
        return;
      }
      resolve({
        next: () =>
          new Promise((settle) => {
            waiting.push(settle);
            deliver();
          }),
        close: async () => {
          // as a browser leaving: the connection closes, without an error
          body?.destroy();
          await closed;
        },
      });
    });
  });
}

/** The streams a test opened; `closeAll` closes every one. */
export interface OpenStreams {
  open(agent: Agent, path: string): Promise<SseStream>;
  closeAll(): Promise<void>;
}

/**
 * Tracks a test's streams so its teardown can close them all, as browsers
 * leaving do. Closing the app first also ends them.
 */
export function openStreams(): OpenStreams {
  const streams: Promise<SseStream>[] = [];
  return {
    open: (agent, path) => {
      const stream = openSse(agent, path);
      streams.push(stream);
      return stream;
    },
    closeAll: async () => {
      const opened = await Promise.allSettled(streams);
      await Promise.all(
        opened.map((result) =>
          result.status === 'fulfilled' ? result.value.close() : undefined,
        ),
      );
    },
  };
}
