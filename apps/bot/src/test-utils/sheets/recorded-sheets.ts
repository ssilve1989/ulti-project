import { createHash } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { isEncounter } from '@ulti-project/shared';
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

const QUOTA_WINDOW_MS = 60_000;
const QUOTA_BUDGET = 45;

/**
 * Google allows 60 Sheets read and 60 write requests per minute per user, and
 * the service account is shared with manual testing, so a recording run paces
 * itself below that. The quota spans the whole run, so one pacer watches every
 * test's requests; it keeps only the last minute of them.
 */
class SheetsQuotaPacer {
  private requests: Array<{ at: number; write: boolean }> = [];

  readonly observe = (message: unknown): void => {
    const request = createdRequest(message);
    if (request?.host === 'sheets.googleapis.com') {
      this.requests.push({ at: Date.now(), write: request.method !== 'GET' });
    }
  };

  /** Waits until reads and writes in the last minute are back under budget. */
  async waitForBudget(): Promise<void> {
    for (;;) {
      const windowStart = Date.now() - QUOTA_WINDOW_MS;
      this.requests = this.requests.filter(({ at }) => at > windowStart);
      const reads = this.requests.filter(({ write }) => !write);
      const writes = this.requests.filter(({ write }) => write);
      const over = [reads, writes].find((kind) => kind.length >= QUOTA_BUDGET);
      if (!over) return;
      const oldest = over[0]?.at ?? Date.now();
      await sleep(oldest + QUOTA_WINDOW_MS - Date.now() + 100);
    }
  }
}

/** Only a recording makes real requests, so it watches only while one runs. */
const quotaPacer = new SheetsQuotaPacer();

// Fixture names are paths relative to the repo root. The mode is set per
// recording instead: setting it activates nock and blocks the network, which
// must only happen while a flow app runs, not whenever this module is imported.
nock.back.fixtures = process.cwd();
// nock intercepts all of node:http as soon as it's imported; undo that so only
// a running flow app's recording does
nock.restore();

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
 * The app only ever looks a tab up by an encounter's name, so a recorded tab
 * list keeps just the encounter tabs. The rest of the spreadsheet is none of a
 * test's business.
 */
function keepEncounterTabs(definition: Definition): Definition {
  const { response } = definition;
  if (!isRecord(response) || !Array.isArray(response.sheets)) {
    return definition;
  }
  const sheets: unknown[] = response.sheets.filter((sheet: unknown) => {
    const title =
      isRecord(sheet) && isRecord(sheet.properties)
        ? sheet.properties.title
        : undefined;
    return typeof title === 'string' && isEncounter(title);
  });
  return { ...definition, response: { ...response, sheets } };
}

/**
 * Whether a recorded request went to Google (the Sheets API or its OAuth token
 * endpoint). A recording keeps only these: anything else the test reached, such
 * as its own local server, belongs to the test, not the recording.
 */
function isGoogleTraffic({ scope }: Definition): boolean {
  const { hostname } = new URL(String(scope));
  return hostname === 'googleapis.com' || hostname.endsWith('.googleapis.com');
}

/**
 * Prepares what a recording run captured to be written: keeps only Google
 * traffic and strips credentials. The OAuth token exchange carries a signed JWT
 * assertion (identifying the service account) and returns an access token.
 */
export function scrub(definitions: Definition[]): Definition[] {
  return stableOrder(definitions.filter(isGoogleTraffic)).map((definition) => {
    // keep only the headers the client needs to read the body
    const headers: Record<string, string | string[]> = {};
    for (const name of ['content-type', 'content-encoding']) {
      const value = definition.rawHeaders?.[name];
      if (value !== undefined) headers[name] = value;
    }
    const scrubbed = keepEncounterTabs(
      decodeGzippedJson({ ...definition, rawHeaders: headers }),
    );
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
 *
 * `replayOnly` replays even in a recording run. While nock records, it sends
 * every request to the real network and ignores the test's own interceptors,
 * so a test that intercepts other services (e.g. Discord's OAuth endpoints)
 * must replay; it then can't make Sheets requests, which fail as in any replay.
 */
export async function startSheetsRecording({
  replayOnly = false,
}: {
  readonly replayOnly?: boolean;
} = {}): Promise<{
  /** The value grids the spreadsheet returned to the app's reads of `range` (e.g. `DSR!I:L`), made as `requestPaths` (from `readPaths`), in order. */
  valuesRead(range: string, requestPaths: string[]): unknown[];
  /** Stops recording/replaying; when replaying, fails if a recorded request went unused. */
  finish(): void;
  /** Stops without checking, for when the test failed to even start. */
  abandon(): void;
}> {
  const { testPath, testName } = currentTest();
  const recording = isRecordingSheets && !replayOnly;
  if (recording) await quotaPacer.waitForBudget();

  const fixture = join(
    relative(process.cwd(), dirname(testPath)),
    '__recordings__',
    basename(testPath, '.ts'),
    `${testName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
  );
  const fixturePath = join(process.cwd(), fixture);
  nock.back.setMode(recording ? 'update' : 'lockdown');
  const { nockDone, context } = await nock.back(fixture, {
    afterRecord: scrub,
  });
  if (recording) subscribe(HTTP_REQUEST_CREATED, quotaPacer.observe);
  // tests may run their own local servers (e.g. the harness's own spec)
  nock.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);

  const restore = () => {
    nock.cleanAll();
    nock.restore();
    nock.enableNetConnect();
    if (recording) unsubscribe(HTTP_REQUEST_CREATED, quotaPacer.observe);
  };

  // what the recording holds so far, as it's (or will be) written to disk
  const definitions = (): Definition[] =>
    recording ? scrub(nock.recorder.play().filter(isDefinition)) : replayed;
  const replayed: Definition[] = recording
    ? []
    : existsSync(fixturePath)
      ? parseDefinitions(readFileSync(fixturePath, 'utf8'))
      : [];

  return {
    valuesRead(range, requestPaths) {
      // each request the app made gets the recorded response to that same
      // request, repeats of it answered in order
      const seen = new Map<string, number>();
      return requestPaths.map((requestPath) => {
        const occurrence = seen.get(requestPath) ?? 0;
        seen.set(requestPath, occurrence + 1);
        const recorded = definitions().filter(
          ({ method, path }) =>
            method === 'GET' &&
            decodeURIComponent(String(path)) === requestPath,
        )[occurrence];
        const response = recorded?.response;
        if (!isRecord(response)) return undefined;
        if (!Array.isArray(response.valueRanges)) return response.values;
        const valueRange: unknown =
          response.valueRanges[rangesRead(requestPath).indexOf(range)];
        return isRecord(valueRange) ? valueRange.values : undefined;
      });
    },
    finish() {
      nockDone();
      // A test that made no Sheets requests needs no recording: replay blocks the
      // network, so a request it starts making later still fails the test.
      if (recording && readFileSync(fixturePath, 'utf8').trim() === '[]') {
        rmSync(fixturePath);
        // and the recordings folders above it, if that leaves them empty
        for (const folder of [
          dirname(fixturePath),
          dirname(dirname(fixturePath)),
        ]) {
          if (readdirSync(folder).length === 0)
            rmSync(folder, { recursive: true });
        }
      }
      try {
        if (!recording) context.assertScopesFinished();
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

/**
 * The ranges a Sheets read request asks for: one for `values/{range}`, several
 * for `values:batchGet?ranges=…&ranges=…`. `path` is decoded.
 */
function rangesRead(path: string): string[] {
  const [pathname = '', query = ''] = path.split('?');
  if (pathname.endsWith('/values:batchGet')) {
    return new URLSearchParams(query).getAll('ranges');
  }
  const [, range] = pathname.split('/values/');
  return range === undefined ? [] : [range];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDefinition(value: unknown): value is Definition {
  return (
    isRecord(value) &&
    typeof value.scope === 'string' &&
    typeof value.path === 'string'
  );
}

/** A recording file's definitions. */
function parseDefinitions(text: string): Definition[] {
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.filter(isDefinition) : [];
}

/** A request the app sent to change the spreadsheet, exactly as sent. */
export interface SheetsWrite {
  method: string;
  /** decoded, including the query, e.g. `/v4/spreadsheets/…/values/DSR!I24:L?valueInputOption=USER_ENTERED` */
  path: string;
  body: unknown;
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
    const created = createdRequest(message);
    if (created?.host !== 'sheets.googleapis.com') return;
    const { request } = created;
    const chunks: Buffer[] = [];
    const entry = {
      method: created.method,
      path: decodeURIComponent(created.path),
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
    /** Every request that changes the spreadsheet (anything but a GET), in order. */
    writes(): SheetsWrite[] {
      return bodies().filter(({ method }) => method !== 'GET');
    },
    /** The decoded path (with query) of each read of `range` the app has made so far, in order. */
    readPaths(range: string): string[] {
      return requests
        .filter(
          ({ method, path }) =>
            method === 'GET' && rangesRead(path).includes(range),
        )
        .map(({ path }) => path);
    },
    dispose() {
      unsubscribe(HTTP_REQUEST_CREATED, onCreated);
    },
  };
}
