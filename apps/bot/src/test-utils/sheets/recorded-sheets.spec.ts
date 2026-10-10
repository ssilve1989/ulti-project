import nock, { type Definition } from 'nock';
import { describe, expect, it, vi } from 'vitest';
import { scrub, testKey } from './recorded-sheets.js';

describe('testKey', () => {
  it('differs for tests with the same name in different spec files', () => {
    expect(testKey('apps/bot/src/a.flow.spec.ts', 'approves it')).not.toBe(
      testKey('apps/bot/src/b.flow.spec.ts', 'approves it'),
    );
  });

  it('is the same every run for the same spec file and test', () => {
    // committed recordings are keyed by this value, so it must never drift
    expect(testKey('apps/bot/src/a.flow.spec.ts', 'approves it')).toBe(
      '182e785e',
    );
  });
});

describe('importing the recording harness', () => {
  // nock activates itself on import; only a running flow app should intercept
  it('leaves HTTP alone until a recording starts', async () => {
    // what nock does to HTTP when it's first imported
    nock.activate();
    try {
      // a copy of the module evaluated now, not whenever this worker first
      // loaded it (an earlier flow spec may have restored nock since)
      const specifier = './recorded-sheets.js?evaluated-by-this-test';
      await import(specifier);

      expect(nock.isActive()).toBe(false);
    } finally {
      nock.restore();
    }
  });
});

describe('when a recording run captures traffic beyond Google', () => {
  const sheetsRead: Definition = {
    scope: 'https://sheets.googleapis.com:443',
    method: 'GET',
    path: '/v4/spreadsheets/sheet-id/values/DSR!I:L',
    status: 200,
    response: { values: [['a']] },
    rawHeaders: { 'content-type': 'application/json; charset=UTF-8' },
  };
  const tokenExchange: Definition = {
    scope: 'https://oauth2.googleapis.com:443',
    method: 'POST',
    path: '/token',
    body: 'grant_type=jwt-bearer&assertion=signed',
    status: 200,
    response: { access_token: 'real-token' },
    rawHeaders: { 'content-type': 'application/json' },
  };

  it('keeps only the Google requests', () => {
    expect(
      scrub([
        {
          scope: 'http://127.0.0.1:51234',
          method: 'GET',
          path: '/api/health',
          status: 200,
          response: 'ok',
        },
        sheetsRead,
        {
          scope: 'https://discord.com:443',
          method: 'POST',
          path: '/api/oauth2/token',
          body: 'client_secret=dev-secret',
          status: 200,
          response: { access_token: 'discord-token' },
        },
        tokenExchange,
      ]),
    ).toEqual([
      sheetsRead,
      {
        ...tokenExchange,
        body: undefined,
        response: {
          access_token: 'redacted-by-recorded-sheets',
          expires_in: 3599,
          token_type: 'Bearer',
        },
      },
    ]);
  });
});

describe('when an HTTP flow runs during a recording run', () => {
  it("answers from the test's own interceptors, never the real network", async () => {
    vi.stubEnv('NOCK_BACK_MODE', 'update');
    // a copy of the module evaluated in recording mode
    const specifier = './recorded-sheets.js?evaluated-in-recording-mode';
    const harness: typeof import('./recorded-sheets.js') = await import(
      specifier
    );
    const replay = await harness.startSheetsRecording({ replayOnly: true });
    try {
      nock('https://discord.com')
        .post('/api/oauth2/token')
        .reply(200, { access_token: 'intercepted' });

      const intercepted: unknown = await fetch(
        'https://discord.com/api/oauth2/token',
        { method: 'POST' },
      ).then((response) => response.json());
      const unmocked = fetch('https://sheets.googleapis.com/v4/spreadsheets');

      expect(intercepted).toEqual({ access_token: 'intercepted' });
      await expect(unmocked).rejects.toThrow(/Disallowed net connect/);
    } finally {
      replay.abandon();
      vi.unstubAllEnvs();
    }
  });
});
