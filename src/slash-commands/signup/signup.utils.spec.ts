import { describe, expect, test } from 'vitest';
import {
  PartyStatus,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import {
  extractFflogsReportCode,
  hasClearedStatus,
  shouldDeleteReviewMessageForSignup,
} from './signup.utils.js';

describe('extractFflogsReportCode', () => {
  test.each([
    ['standard FFLogs URL', 'https://www.fflogs.com/reports/ABC123def456'],
    ['FFLogs URL without www', 'https://fflogs.com/reports/ABC123def456'],
    [
      'FFLogs URL with trailing slash',
      'https://www.fflogs.com/reports/ABC123def456/',
    ],
    [
      'FFLogs URL with fragment',
      'https://www.fflogs.com/reports/ABC123def456#fight=1&type=damage-done',
    ],
  ])('should extract report code from %s', (_, url) => {
    const result = extractFflogsReportCode(url);
    expect(result).toBe('ABC123def456');
  });

  test.each([
    ['non-FFLogs URL', 'https://example.com/reports/ABC123def456'],
    ['invalid URL', 'not-a-url'],
    ['FFLogs URL without report code', 'https://www.fflogs.com/'],
    [
      'malicious URL with fflogs.com in path',
      'https://evil.com/fflogs.com/fake-report/ABC123',
    ],
    [
      'URL with fflogs.com as subdomain of malicious domain',
      'https://fflogs.com.evil.com/reports/ABC123',
    ],
    [
      'URL with fflogs.com in query parameter',
      'https://evil.com/reports/ABC123?redirect=fflogs.com',
    ],
  ])('should return null for %s', (_, url) => {
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });
});

describe('shouldDeleteReviewMessageForSignup', () => {
  test.each([
    [SignupStatus.PENDING, true],
    [SignupStatus.UPDATE_PENDING, true],
    [SignupStatus.APPROVED, false],
  ])('should return %s for %s status', (status, expected) => {
    const signup = { status } as any;
    expect(shouldDeleteReviewMessageForSignup(signup)).toBe(expected);
  });
});

describe('hasClearedStatus', () => {
  test.each([
    [true, 'partyStatus is Cleared', PartyStatus.Cleared],
    [false, 'partyStatus is not Cleared', PartyStatus.ProgParty],
    [false, 'partyStatus is undefined', undefined],
  ])('should return %s when %s', (expected, _, partyStatus) => {
    const signup = { partyStatus };
    expect(hasClearedStatus(signup)).toBe(expected);
  });
});
