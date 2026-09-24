import { createHash } from 'node:crypto';
import { subscribe } from 'node:diagnostics_channel';
import { ClientRequest } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import nock, { type BackMode, type Definition } from 'nock';
import { expect } from 'vitest';

/**
 * Google Sheets traffic in flow specs is recorded from the real shared test
 * spreadsheet once (`pnpm test:record`) and replayed on every other run with the
 * network disabled, so every response a test sees is one Google really returned.
 * This is the practice Google documents for its own API clients ("save actual API
 * responses … for use in testing"), automated with nock's record/replay.
 */
const MODE = recordingMode();

function recordingMode(): BackMode {
  const mode = process.env.NOCK_BACK_MODE;
  switch (mode) {
    case undefined:
    case 'lockdown':
      return 'lockdown';
    case 'update':
      return 'update';
    default:
      throw new Error(
        `Unsupported NOCK_BACK_MODE "${mode}": use "update" (pnpm test:record) or leave it unset`,
      );
  }
}

/** Whether this run talks to the real test spreadsheet (and so needs real credentials). */
const isRecordingSheets = MODE === 'update';

const REDACTED = 'redacted-by-recorded-sheets';

/**
 * Google allows 60 Sheets read and 60 write requests per minute per user, and
 * the service account is shared with manual testing. A recording run paces
 * itself below that; replays make no real requests and never wait.
 */
const QUOTA_WINDOW_MS = 60_000;
const QUOTA_BUDGET = 45;
const sheetsRequests: Array<{ at: number; write: boolean }> = [];

if (isRecordingSheets) {
  subscribe('http.client.request.created', (message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'request' in message &&
      message.request instanceof ClientRequest &&
      message.request.host === 'sheets.googleapis.com'
    ) {
      sheetsRequests.push({
        at: Date.now(),
        write: message.request.method !== 'GET',
      });
    }
  });
}

/** Waits until reads and writes in the last minute are back under budget. */
async function waitForSheetsQuota(): Promise<void> {
  for (;;) {
    const windowStart = Date.now() - QUOTA_WINDOW_MS;
    const recent = sheetsRequests.filter(({ at }) => at > windowStart);
    const reads = recent.filter(({ write }) => !write);
    const writes = recent.filter(({ write }) => write);
    const over = [reads, writes].find((kind) => kind.length >= QUOTA_BUDGET);
    if (!over) return;
    const oldest = over[0]?.at ?? Date.now();
    await sleep(oldest + QUOTA_WINDOW_MS - Date.now() + 100);
  }
}

/**
 * Orders a recording by request so concurrent requests (e.g. reading two sheet
 * sections in parallel) don't reorder it between recording runs and produce
 * noisy diffs. Replay matches by request, not position, and the sort is stable,
 * so repeats of the same request keep their recorded order.
 */
function stableOrder(definitions: Definition[]): Definition[] {
  const key = ({ method, path, body }: Definition) =>
    `${method ?? ''} ${String(path)} ${JSON.stringify(body ?? null)}`;
  return [...definitions].sort((a, b) => key(a).localeCompare(key(b)));
}

/**
 * Strips credentials before a recording is written: the OAuth token exchange
 * carries a signed JWT assertion (identifying the service account) and returns
 * an access token.
 */
function scrub(definitions: Definition[]): Definition[] {
  return stableOrder(definitions).map((definition) => {
    // keep only the headers the client needs to decode the body: Google gzips
    // responses and nock records the compressed bytes
    const headers: Record<string, string | string[]> = {};
    for (const name of ['content-type', 'content-encoding']) {
      const value = definition.rawHeaders?.[name];
      if (value !== undefined) headers[name] = value;
    }
    const scrubbed: Definition = { ...definition, rawHeaders: headers };
    if (String(definition.path).includes('/token')) {
      // the assertion is signed at request time, so replays can't match it; drop it
      scrubbed.body = undefined;
      // the replacement token below is plain JSON
      scrubbed.rawHeaders = { 'content-type': 'application/json' };
      scrubbed.response = {
        access_token: REDACTED,
        expires_in: 3599,
        token_type: 'Bearer',
      };
    }
    return scrubbed;
  });
}

function currentTest(): { testPath: string; testName: string } {
  const { testPath, currentTestName } = expect.getState();
  if (!testPath || !currentTestName) {
    throw new Error('recorded sheets can only be used inside a running test');
  }
  return { testPath, testName: currentTestName };
}

/**
 * A stable, per-test name for data this test writes to the shared spreadsheet:
 * unique between tests (so rows never collide) and identical between runs (so
 * recorded requests replay exactly).
 */
export function stableTestKey(): string {
  const { testName } = currentTest();
  return createHash('sha256').update(testName).digest('hex').slice(0, 8);
}

/**
 * Starts recording (pnpm test:record) or replaying this test's Sheets traffic.
 * When replaying, finishing fails if the app didn't make every recorded
 * request, meaning its Sheets usage changed and the recording must be
 * refreshed.
 */
export async function startSheetsRecording(): Promise<{
  /** Stops recording/replaying; when replaying, fails if a recorded request went unused. */
  finish(): void;
  /** Stops without checking, for when the test failed to even start. */
  abandon(): void;
}> {
  const { testPath, testName } = currentTest();
  if (isRecordingSheets) await waitForSheetsQuota();
  nock.back.fixtures = join(
    dirname(testPath),
    '__recordings__',
    basename(testPath, '.ts'),
  );
  nock.back.setMode(MODE);

  const fixture = `${testName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
  const { nockDone, context } = await nock.back(fixture, {
    afterRecord: scrub,
  });
  // tests may run their own local servers (e.g. the harness's own spec)
  nock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);

  const restore = () => {
    nock.cleanAll();
    nock.restore();
    nock.enableNetConnect();
  };

  return {
    finish() {
      nockDone();
      try {
        if (!isRecordingSheets) context.assertScopesFinished();
      } finally {
        restore();
      }
    },
    abandon() {
      nockDone();
      restore();
    },
  };
}
