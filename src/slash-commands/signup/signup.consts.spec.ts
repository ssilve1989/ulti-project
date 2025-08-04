import { describe, expect, test } from 'vitest';
import {
  PROG_PROOF_HOSTS_WHITELIST,
  WHITELIST_VALIDATION_ERROR,
} from './signup.consts.js';

describe('PROG_PROOF_HOSTS_WHITELIST', () => {
  test.each([
    ['https://fflogs.com/reports/ABC123', true],
    ['https://www.fflogs.com/reports/ABC123', true],
    ['https://medal.tv/games/ff-xiv-online', true],
    ['https://www.medal.tv/clips/abc123', true],
    ['https://streamable.com/abc123', true],
    ['https://www.streamable.com/abc123', true],
    ['https://twitch.tv/videos/123456', true],
    ['https://www.twitch.tv/videos/123456', true],
    ['https://youtube.com/watch?v=abc123', true],
    ['https://www.youtube.com/watch?v=abc123', true],
    ['https://example.com/invalid', false],
    ['https://badsite.net/test', false],
  ])('should validate URL %s as %s', (url, shouldPass) => {
    const isValid = PROG_PROOF_HOSTS_WHITELIST.some((regex) => regex.test(url));
    expect(isValid).toBe(shouldPass);
  });
});

describe('WHITELIST_VALIDATION_ERROR', () => {
  test('should include all whitelisted domains in error message', () => {
    expect(WHITELIST_VALIDATION_ERROR).toContain('fflogs.com');
    expect(WHITELIST_VALIDATION_ERROR).toContain('medal.tv');
    expect(WHITELIST_VALIDATION_ERROR).toContain('streamable.com');
    expect(WHITELIST_VALIDATION_ERROR).toContain('twitch.tv');
    expect(WHITELIST_VALIDATION_ERROR).toContain('youtube.com');
  });
});
