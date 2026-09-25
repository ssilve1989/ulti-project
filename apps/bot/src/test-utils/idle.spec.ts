import { channel } from 'node:diagnostics_channel';
import { EventEmitter } from 'node:events';
import {
  createServer,
  get,
  type RequestListener,
  type Server,
} from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { test as base, describe, expect } from 'vitest';
import { fresh } from './fixtures.js';
import {
  type ActivityTracker,
  createActivityTracker,
  HTTP_REQUEST_CREATED,
  waitUntilIdle,
} from './idle.js';

class SlowSheets {
  finished = false;

  async upsert(): Promise<string> {
    await sleep(50);
    this.finished = true;
    return 'written';
  }

  async fail(): Promise<void> {
    await sleep(10);
    throw new Error('quota exceeded');
  }
}

const it = base.extend<{
  tracker: ActivityTracker;
  serve: ((handler: RequestListener) => Promise<string>) & {
    servers: Server[];
  };
}>({
  tracker: fresh(createActivityTracker, (tracker) => tracker.dispose()),
  serve: fresh(
    () => {
      const servers: Server[] = [];
      /** Starts a local HTTP server with `handler`; returns its URL. */
      const serve = async (handler: RequestListener): Promise<string> => {
        const server = createServer(handler);
        servers.push(server);
        await new Promise<void>((resolve) =>
          server.listen(0, '127.0.0.1', resolve),
        );
        const address = server.address();
        if (typeof address !== 'object' || address === null) {
          throw new Error('expected the server to listen on a TCP port');
        }
        return `http://127.0.0.1:${address.port}/`;
      };
      return Object.assign(serve, { servers });
    },
    // closed even when a test fails first, so no server outlives its test
    ({ servers }) =>
      Promise.all(
        servers.map(
          (server) =>
            new Promise((resolve) => {
              server.closeAllConnections();
              server.close(resolve);
            }),
        ),
      ),
  ),
});

describe('waitUntilIdle', () => {
  it('waits for an HTTP request in flight', async ({ tracker, serve }) => {
    const url = await serve((_request, response) => {
      setTimeout(() => response.end('ok'), 200);
    });
    let finished = false;

    void fetch(url)
      .then((response) => response.text())
      .then(() => {
        finished = true;
      });
    await waitUntilIdle(tracker);

    expect(finished).toBe(true);
  });

  it('waits for the response body, not just its headers', async ({
    tracker,
    serve,
  }) => {
    const url = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.write('first part');
      setTimeout(() => response.end(' and the rest'), 200);
    });
    let body = '';

    const request = get(url, (response) => {
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
    });
    request.end();
    await waitUntilIdle(tracker);

    expect(body).toBe('first part and the rest');
  });

  // nock swaps http.ClientRequest while it intercepts, and the ESM view of
  // node:http can keep its class after it restores, so requests are
  // recognised by shape, not by class
  it('tracks a node:http request whatever class created it', ({ tracker }) => {
    const request = Object.assign(new EventEmitter(), {
      host: 'sheets.googleapis.com',
      method: 'GET',
      path: '/v4/spreadsheets/x',
    });

    channel(HTTP_REQUEST_CREATED).publish({ request });
    const whileInFlight = tracker.pending;
    request.emit('close');

    expect([whileInFlight, tracker.pending]).toEqual([1, 0]);
  });

  it('waits for a tracked call even while no HTTP request is in flight', async ({
    tracker,
  }) => {
    const sheets = new SlowSheets();
    tracker.trackCalls(sheets);

    void sheets.upsert();
    await waitUntilIdle(tracker);

    expect(sheets.finished).toBe(true);
  });

  it('leaves tracked calls returning and rejecting exactly as before', async ({
    tracker,
  }) => {
    const sheets = new SlowSheets();
    tracker.trackCalls(sheets);

    await expect(sheets.upsert()).resolves.toBe('written');
    await expect(sheets.fail()).rejects.toThrow('quota exceeded');
  });
});
