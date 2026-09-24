import { describe, expect, it } from 'vitest';
import { testKey } from './recorded-sheets.js';

describe('testKey', () => {
  it('differs for tests with the same name in different spec files', () => {
    expect(testKey('apps/bot/src/a.flow.spec.ts', 'approves it')).not.toBe(
      testKey('apps/bot/src/b.flow.spec.ts', 'approves it'),
    );
  });

  it('is the same every run for the same spec file and test', () => {
    expect(testKey('apps/bot/src/a.flow.spec.ts', 'approves it')).toBe(
      testKey('apps/bot/src/a.flow.spec.ts', 'approves it'),
    );
  });
});
