import { URL } from 'node:url';
import { DiscordjsErrorCodes, Embed, EmbedBuilder } from 'discord.js';
import { match, P } from 'ts-pattern';
import { DocumentNotFoundException } from '../../firebase/firebase.exceptions.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../firebase/models/signup.model.js';
import { SIGNUP_MESSAGES, SIGNUP_REVIEW_REACTIONS } from './signup.consts.js';

export function shouldDeleteReviewMessageForSignup({ status }: SignupDocument) {
  // we don't want to remove approvals that were already handled since they
  // may want to be kept as a reference for why a decision was made earlier
  return (
    status === SignupStatus.PENDING || status === SignupStatus.UPDATE_PENDING
  );
}

export function hasClearedStatus({
  partyStatus,
}: Pick<SignupDocument, 'partyStatus'>) {
  return partyStatus === PartyStatus.Cleared;
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
export function extractFflogsReportCode(url: string | URL): string | null {
  try {
    // Check if it's an FFLogs domain (exact match or www subdomain only)
    const parsedUrl = url instanceof URL ? url : new URL(url);
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

/**
 * Checks if the reaction emoji is a valid signup review reaction
 */
export function isValidReactionEmoji(emojiName: string | null): boolean {
  return (
    emojiName === SIGNUP_REVIEW_REACTIONS.APPROVED ||
    emojiName === SIGNUP_REVIEW_REACTIONS.DECLINED
  );
}

/**
 * Checks if the reaction is from a bot (same as message author)
 */
export function isBotReaction(
  messageAuthorId: string,
  userId: string,
): boolean {
  return messageAuthorId === userId;
}

/**
 * Maps error types to appropriate user-facing messages
 */
export function getErrorReplyMessage(error: unknown): string {
  return match(error)
    .with(
      P.instanceOf(DocumentNotFoundException),
      () => SIGNUP_MESSAGES.SIGNUP_NOT_FOUND_FOR_REACTION,
    )
    .with(
      { code: DiscordjsErrorCodes.InteractionCollectorError },
      () => SIGNUP_MESSAGES.PROG_DM_TIMEOUT,
    )
    .otherwise(() => SIGNUP_MESSAGES.GENERIC_APPROVAL_ERROR);
}

/**
 * Builds an embed for prog point confirmation, optionally showing existing prog point
 */
export function buildProgPointConfirmationEmbed(
  sourceEmbed: Embed,
  existingProgPoint?: string,
): EmbedBuilder {
  const embedBuilder = EmbedBuilder.from(sourceEmbed);

  if (existingProgPoint) {
    embedBuilder.addFields([
      {
        name: 'Previously Approved Prog Point',
        value: existingProgPoint,
        inline: true,
      },
    ]);
  }

  return embedBuilder;
}
