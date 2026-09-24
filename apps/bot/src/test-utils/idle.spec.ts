import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ActivityTracker,
  createActivityTracker,
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

describe('waitUntilIdle', () => {
  let tracker: ActivityTracker;

  beforeEach(() => {
    tracker = createActivityTracker();
  });

  afterEach(() => tracker.dispose());

  it('waits for an HTTP request in flight', async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => response.end('ok'), 200);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('expected the server to listen on a TCP port');
    }
    let finished = false;

    void fetch(`http://127.0.0.1:${address.port}/`)
      .then((response) => response.text())
      .then(() => {
        finished = true;
      });
    await waitUntilIdle(tracker);

    expect(finished).toBe(true);
    await new Promise((resolve) => server.close(resolve));
  });

  it('waits for a tracked call even while no HTTP request is in flight', async () => {
    const sheets = new SlowSheets();
    tracker.trackCalls(sheets);

    void sheets.upsert();
    await waitUntilIdle(tracker);

    expect(sheets.finished).toBe(true);
  });

  it('leaves tracked calls returning and rejecting exactly as before', async () => {
    const sheets = new SlowSheets();
    tracker.trackCalls(sheets);

    await expect(sheets.upsert()).resolves.toBe('written');
    await expect(sheets.fail()).rejects.toThrow('quota exceeded');
  });
});
