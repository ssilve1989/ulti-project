import { describe, expect, test } from 'vitest';
import { WHITELIST_VALIDATION_ERROR } from './signup.consts.js';
import { signupSchema } from './signup.schema.js';

const baseRequest = {
  character: 'Tester',
  discordId: '123456789',
  role: 'tank',
  progPointRequested: 'Cleared',
  encounter: 'FRU',
  notes: null,
  username: 'TestUser',
  world: 'cactuar',
};

/** The whole parsed signup for baseRequest, with `proofOfProgLink` as stored. */
const parsedWith = (proofOfProgLink: string | null) => ({
  ...baseRequest,
  character: 'tester',
  username: 'testuser',
  screenshot: null,
  proofOfProgLink,
});

function parse(
  overrides: Partial<Record<'proofOfProgLink' | 'screenshot', unknown>>,
) {
  return signupSchema.safeParse({ ...baseRequest, ...overrides });
}

describe('proofOfProgLink validation', () => {
  describe('accepts whitelisted hosts', () => {
    test.each([
      ['fflogs.com', 'https://fflogs.com/reports/ABC123def456'],
      ['fflogs.com with www', 'https://www.fflogs.com/reports/ABC123def456'],
      [
        'fflogs.com with nested subdomain',
        'https://sub.domain.fflogs.com/reports/ABC123def456',
      ],
      ['streamable.com', 'https://streamable.com/abc123'],
      ['twitch.tv', 'https://twitch.tv/videos/123456789'],
      ['twitch.tv with www', 'https://www.twitch.tv/videos/123456789'],
      ['youtube.com', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
      ['youtube.com with www', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
      ['medal.tv', 'https://medal.tv/games/ff-xiv-online'],
      ['medal.tv any path', 'https://medal.tv/clips/abc123'],
    ])('accepts a valid %s link, unchanged', (_, url) => {
      const result = parse({ proofOfProgLink: url });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual(parsedWith(url));
    });

    test.each([
      [
        'fflogs.com with port',
        'https://fflogs.com:8443/reports/ABC123def456',
        'https://fflogs.com:8443/reports/ABC123def456',
      ],
      [
        'uppercase hostname',
        'https://FFLOGS.COM/reports/ABC123def456',
        'https://fflogs.com/reports/ABC123def456',
      ],
      [
        'youtube.com with query params',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s',
      ],
    ])('accepts %s', (_, url, stored) => {
      const result = parse({ proofOfProgLink: url });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual(parsedWith(stored));
    });
  });

  describe('normalizes the protocol', () => {
    test.each([
      [
        'fflogs.com without protocol',
        'fflogs.com/reports/ABC123def456',
        'https://fflogs.com/reports/ABC123def456',
      ],
      [
        'youtube.com without protocol',
        'www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ],
    ])('prepends https:// to %s', (_, url, normalized) => {
      const result = parse({ proofOfProgLink: url });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual(parsedWith(normalized));
    });

    test('preserves an explicit http:// protocol', () => {
      const result = parse({
        proofOfProgLink: 'http://fflogs.com/reports/ABC123def456',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual(
        parsedWith('http://fflogs.com/reports/ABC123def456'),
      );
    });

    test('normalizes the parsed url', () => {
      const result = parse({ proofOfProgLink: 'youtube.com' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual(parsedWith('https://youtube.com/'));
    });
  });

  describe('rejects whitelisted hosts embedded in malicious domains', () => {
    test.each([
      [
        'fflogs.com as subdomain',
        'https://fflogs.com.evil.com/reports/ABC123def456',
      ],
      ['streamable.com as subdomain', 'https://streamable.com.evil.com/abc123'],
      ['twitch.tv as subdomain', 'https://twitch.tv.evil.com/videos/123456789'],
      [
        'youtube.com as subdomain',
        'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      ],
      ['medal.tv as subdomain', 'https://medal.tv.evil.com/clips/abc123'],
      [
        'whitelisted host in path',
        'https://evil.com/fflogs.com/fake-report/ABC123',
      ],
      [
        'whitelisted host in query',
        'https://evil.com/reports/ABC123?redirect=fflogs.com',
      ],
      [
        'whitelisted host in userinfo',
        'https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ',
      ],
      ['whitelisted host as fragment', 'https://evil.com/report#fflogs.com'],
    ])('rejects a link with %s', (_, url) => {
      const result = parse({ proofOfProgLink: url });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === 'proofOfProgLink',
        ),
      ).toBe(true);
    });
  });

  describe('rejects lookalike and unrelated domains', () => {
    test.each([
      ['lookalike domain', 'https://evilyoutube.com/'],
      ['hyphenated lookalike', 'https://you-tube.com/'],
      ['lookalike fflogs domain', 'https://fflogs.com.evil.com/'],
      ['unrelated domain', 'https://example.com/reports/ABC123'],
      ['ip address', 'https://192.168.1.1/reports/ABC123'],
      ['trailing dot host', 'https://fflogs.com./reports/ABC123'],
    ])('rejects a link from an %s', (_, url) => {
      const result = parse({ proofOfProgLink: url });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(WHITELIST_VALIDATION_ERROR);
      }
    });
  });

  describe('rejects malformed or invalid values', () => {
    test.each([
      ['not a url', 'not-a-url'],
      ['empty string', ''],
      ['non-http protocol', 'ftp://fflogs.com/reports/ABC123'],
      ['http protocol without slashes', 'http:fflogs.com/reports/ABC123'],
      ['surrounding whitespace', '  https://fflogs.com/reports/ABC123  '],
      ['non-string value', 123],
    ])('rejects %s, as an invalid link', (_, url) => {
      const result = parse({ proofOfProgLink: url });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['proofOfProgLink'],
      ]);
    });
  });

  describe('interaction with the screenshot requirement', () => {
    test('accepts a null link when a screenshot is provided', () => {
      const result = parse({
        proofOfProgLink: null,
        screenshot: 'https://i.imgur.com/x.png',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual({
        ...parsedWith(null),
        screenshot: 'https://i.imgur.com/x.png',
      });
    });

    test('rejects a null link when no screenshot is provided', () => {
      const result = parse({ proofOfProgLink: null });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path[0] === 'screenshot'),
        ).toBe(true);
      }
    });

    test('rejects an undefined link even when a screenshot is provided', () => {
      const result = parse({
        proofOfProgLink: undefined,
        screenshot: 'https://i.imgur.com/x.png',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (issue) => issue.path[0] === 'proofOfProgLink',
          ),
        ).toBe(true);
      }
    });

    test('still rejects an invalid link when a screenshot is provided', () => {
      const result = parse({
        proofOfProgLink: 'https://fflogs.com.evil.com/reports/ABC123',
        screenshot: 'https://i.imgur.com/x.png',
      });
      expect(result.success).toBe(false);
    });
  });
});
