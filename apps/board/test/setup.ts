import { cleanup } from '@solidjs/testing-library';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // node-environment specs have no localStorage
  globalThis.localStorage?.clear();
});
