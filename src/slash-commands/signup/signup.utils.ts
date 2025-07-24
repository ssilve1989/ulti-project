import { URL } from 'node:url';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';

export function shouldDeleteReviewMessageForSignup({ status }: SignupDocument) {
  // we don't want to remove approvals that were already handled since they
  // may want to be kept as a reference for why a decision was made earlier
  return (
    status === SignupStatus.PENDING || status === SignupStatus.UPDATE_PENDING
  );
}

export function hasClearedStatus({
  partyType,
  partyStatus,
}: Pick<SignupDocument, 'partyStatus' | 'partyType'>) {
  return (
    partyType === PartyStatus.Cleared || partyStatus === PartyStatus.Cleared
  );
}

/**
 * Securely checks if a URL belongs to the FFLogs domain.
 *
 * This method provides secure domain validation by using exact hostname
 * matching instead of string inclusion checks. This prevents various
 * URL spoofing attacks where malicious domains could contain 'fflogs.com'
 * in their path, query parameters, or as part of a longer hostname.
 *
 * Security rationale:
 * - Prevents path injection: https://evil.com/fflogs.com/fake
 * - Prevents subdomain spoofing: https://fflogs.com.evil.com
 * - Prevents query parameter injection: https://evil.com?redirect=fflogs.com
 * - Only allows exact matches for fflogs.com and www.fflogs.com
 *
 * @param url The URL string to check
 * @returns boolean - true if URL is from a valid FFLogs domain, false otherwise
 */
export function isFFLogsUrl(url: URL): boolean {
  return url.hostname === 'fflogs.com' || url.hostname === 'www.fflogs.com';
}

/**
 * Extract report code from FFLogs URL
 * Supports various FFLogs URL formats:
 * - https://www.fflogs.com/reports/ABC123
 * - https://fflogs.com/reports/ABC123/
 * - https://www.fflogs.com/reports/ABC123#fight=1
 * @param url FFLogs URL
 * @returns Report code or null if not found
 */
export function extractFflogsReportCode(url: string): string | null {
  try {
    // Check if it's an FFLogs domain (exact match or www subdomain only)
    const parsedUrl = new URL(url);
    if (!isFFLogsUrl(parsedUrl)) {
      return null;
    }

    // Extract report code from path: /reports/ABC123
    const pathMatch = parsedUrl.pathname.match(/\/reports\/([a-zA-Z0-9]+)/);

    return pathMatch ? pathMatch[1] : null;
  } catch {
    // Invalid URL
    return null;
  }
}
