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
  test('should extract report code from standard FFLogs URL', () => {
    const url = 'https://www.fflogs.com/reports/ABC123def456';
    const result = extractFflogsReportCode(url);
    expect(result).toBe('ABC123def456');
  });

  test('should extract report code from FFLogs URL without www', () => {
    const url = 'https://fflogs.com/reports/ABC123def456';
    const result = extractFflogsReportCode(url);
    expect(result).toBe('ABC123def456');
  });

  test('should extract report code from FFLogs URL with trailing slash', () => {
    const url = 'https://www.fflogs.com/reports/ABC123def456/';
    const result = extractFflogsReportCode(url);
    expect(result).toBe('ABC123def456');
  });

  test('should extract report code from FFLogs URL with fragment', () => {
    const url =
      'https://www.fflogs.com/reports/ABC123def456#fight=1&type=damage-done';
    const result = extractFflogsReportCode(url);
    expect(result).toBe('ABC123def456');
  });

  test('should return null for non-FFLogs URL', () => {
    const url = 'https://example.com/reports/ABC123def456';
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });

  test('should return null for invalid URL', () => {
    const url = 'not-a-url';
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });

  test('should return null for FFLogs URL without report code', () => {
    const url = 'https://www.fflogs.com/';
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });

  test('should reject malicious URL with fflogs.com in path', () => {
    const url = 'https://evil.com/fflogs.com/fake-report/ABC123';
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });

  test('should reject URL with fflogs.com as subdomain of malicious domain', () => {
    const url = 'https://fflogs.com.evil.com/reports/ABC123';
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });

  test('should reject URL with fflogs.com in query parameter', () => {
    const url = 'https://evil.com/reports/ABC123?redirect=fflogs.com';
    const result = extractFflogsReportCode(url);
    expect(result).toBeNull();
  });
});

describe('shouldDeleteReviewMessageForSignup', () => {
  test('should return true for PENDING status', () => {
    const signup = { status: SignupStatus.PENDING } as any;
    expect(shouldDeleteReviewMessageForSignup(signup)).toBe(true);
  });

  test('should return true for UPDATE_PENDING status', () => {
    const signup = { status: SignupStatus.UPDATE_PENDING } as any;
    expect(shouldDeleteReviewMessageForSignup(signup)).toBe(true);
  });

  test('should return false for APPROVED status', () => {
    const signup = { status: SignupStatus.APPROVED } as any;
    expect(shouldDeleteReviewMessageForSignup(signup)).toBe(false);
  });
});

describe('hasClearedStatus', () => {
  test('should return true when partyType is Cleared', () => {
    const signup = {
      partyType: PartyStatus.Cleared,
      partyStatus: PartyStatus.ProgParty,
    };
    expect(hasClearedStatus(signup)).toBe(true);
  });

  test('should return true when partyStatus is Cleared', () => {
    const signup = {
      partyType: PartyStatus.ProgParty,
      partyStatus: PartyStatus.Cleared,
    };
    expect(hasClearedStatus(signup)).toBe(true);
  });

  test('should return false when neither is Cleared', () => {
    const signup = {
      partyType: PartyStatus.ProgParty,
      partyStatus: PartyStatus.ProgParty,
    };
    expect(hasClearedStatus(signup)).toBe(false);
  });
});
