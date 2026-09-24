import { createHash } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import nock, { type BackMode, type Definition } from 'nock';
import { expect } from 'vitest';
import { createdRequest, HTTP_REQUEST_CREATED } from '../idle.js';

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
  subscribe(HTTP_REQUEST_CREATED, (message) => {
    const request = createdRequest(message);
    if (request?.host === 'sheets.googleapis.com') {
      sheetsRequests.push({ at: Date.now(), write: request.method !== 'GET' });
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
 * nock records a gzipped response as its compressed bytes in hex: unreadable,
 * and a recording diff can't show what changed. Store the JSON Google sent
 * instead; the client treats a plain JSON body exactly like a decompressed one.
 */
function decodeGzippedJson(definition: Definition): Definition {
  const { response } = definition;
  if (
    definition.rawHeaders?.['content-encoding'] !== 'gzip' ||
    !Array.isArray(response) ||
    !response.every((chunk) => typeof chunk === 'string')
  ) {
    return definition;
  }
  const json: unknown = JSON.parse(
    gunzipSync(Buffer.from(response.join(''), 'hex')).toString(),
  );
  if (!isRecord(json)) return definition;
  const { 'content-encoding': _gzip, ...rawHeaders } = definition.rawHeaders;
  return { ...definition, rawHeaders, response: json };
}

/**
 * Strips credentials before a recording is written: the OAuth token exchange
 * carries a signed JWT assertion (identifying the service account) and returns
 * an access token.
 */
function scrub(definitions: Definition[]): Definition[] {
  return stableOrder(definitions).map((definition) => {
    // keep only the headers the client needs to read the body
    const headers: Record<string, string | string[]> = {};
    for (const name of ['content-type', 'content-encoding']) {
      const value = definition.rawHeaders?.[name];
      if (value !== undefined) headers[name] = value;
    }
    const scrubbed = decodeGzippedJson({ ...definition, rawHeaders: headers });
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
 * A stable, per-test name for data a test writes to the shared spreadsheet,
 * from its spec file (relative to the repo, so it's the same in every checkout
 * and in CI) and test name: unique between tests, including same-named tests
 * in different flow specs, and identical between runs so recordings replay.
 */
export function testKey(specPath: string, testName: string): string {
  return createHash('sha256')
    .update(`${specPath}\n${testName}`)
    .digest('hex')
    .slice(0, 8);
}

/** The {@link testKey} of the running test. */
export function stableTestKey(): string {
  const { testPath, testName } = currentTest();
  return testKey(relative(process.cwd(), testPath), testName);
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
  const fixturePath = join(nock.back.fixtures, fixture);
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
      // A test that made no Sheets requests needs no recording: replay blocks the
      // network, so a request it starts making later still fails the test.
      if (
        isRecordingSheets &&
        readFileSync(fixturePath, 'utf8').trim() === '[]'
      ) {
        rmSync(fixturePath);
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function columnLetter(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

/** A cell range the app wrote values to, e.g. `DSR!I24:L`. */
export interface ValuesWrite {
  range: string;
  values: unknown;
}

/** Cells the app cleared (how SheetsService removes a signup's row). */
export interface CellsCleared {
  row: number;
  columns: string;
}

/**
 * Captures what the app sent to the Sheets API in this run, for asserting what
 * it wrote. Assert on this, not on reading the sheet back: in a replay, a read
 * returns the recorded sheet, not what this run wrote. Observation only: request
 * bodies are copied as they're written and passed through unchanged.
 */
export function captureSheetsRequests() {
  const requests: Array<{ method: string; path: string; chunks: Buffer[] }> =
    [];

  const onCreated = (message: unknown) => {
    const request = createdRequest(message);
    if (request?.host !== 'sheets.googleapis.com') return;
    const chunks: Buffer[] = [];
    const entry = {
      method: request.method,
      path: decodeURIComponent(request.path),
      chunks,
    };
    requests.push(entry);
    for (const name of ['write', 'end']) {
      const original: unknown = Reflect.get(request, name);
      if (typeof original !== 'function') continue;
      Object.defineProperty(request, name, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => {
          const [chunk] = args;
          if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
            entry.chunks.push(Buffer.from(chunk));
          }
          return Reflect.apply(original, request, args);
        },
      });
    }
  };
  subscribe(HTTP_REQUEST_CREATED, onCreated);

  const bodies = () =>
    requests.map(({ method, path, chunks }) => {
      const text = Buffer.concat(chunks).toString();
      const body: unknown = text ? JSON.parse(text) : undefined;
      return { method, path, body };
    });

  return {
    valuesWritten(): ValuesWrite[] {
      return bodies().flatMap(({ method, path, body }) => {
        const [, rest] = path.split('/values/');
        if (method === 'GET' || rest === undefined || !isRecord(body)) {
          return [];
        }
        const range = rest.split('?')[0]?.replace(/:append$/, '') ?? '';
        return [{ range, values: body.values }];
      });
    },
    cellsCleared(): CellsCleared[] {
      return bodies().flatMap(({ path, body }) => {
        if (!path.includes(':batchUpdate') || !isRecord(body)) return [];
        const updates = Array.isArray(body.requests) ? body.requests : [];
        return updates.flatMap((update: unknown) => {
          const range =
            isRecord(update) && isRecord(update.updateCells)
              ? update.updateCells.range
              : undefined;
          if (
            !isRecord(range) ||
            typeof range.startRowIndex !== 'number' ||
            typeof range.startColumnIndex !== 'number' ||
            typeof range.endColumnIndex !== 'number'
          ) {
            return [];
          }
          return [
            {
              row: range.startRowIndex + 1,
              columns: `${columnLetter(range.startColumnIndex)}:${columnLetter(range.endColumnIndex - 1)}`,
            },
          ];
        });
      });
    },
    dispose() {
      unsubscribe(HTTP_REQUEST_CREATED, onCreated);
    },
  };
}
