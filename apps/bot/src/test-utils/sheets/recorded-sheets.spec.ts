import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { testKey } from './recorded-sheets.js';

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
