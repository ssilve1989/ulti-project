import { URL } from 'node:url';
import { DiscordjsErrorCodes, Embed, EmbedBuilder } from 'discord.js';
import { match, P } from 'ts-pattern';
import { DocumentNotFoundException } from '../../firebase/firebase.exceptions.js';
import {
  type ApprovedSignupDocument,
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
}: Pick<ApprovedSignupDocument, 'partyStatus'>) {
  return partyStatus === PartyStatus.Cleared;
}

// exact hostname match prevents subdomain spoofing (e.g. fflogs.com.evil.com)
export function isFFLogsUrl(url: URL): boolean {
  return url.hostname === 'fflogs.com' || url.hostname === 'www.fflogs.com';
}

export function extractFflogsReportCode(url: string | URL): string | null {
  try {
    const parsedUrl = url instanceof URL ? url : new URL(url);
    if (!isFFLogsUrl(parsedUrl)) {
      return null;
    }

    const pathMatch = parsedUrl.pathname.match(/\/reports\/([a-zA-Z0-9]+)/);

    return pathMatch ? pathMatch[1] : null;
  } catch {
    return null;
  }
}

export function isValidReactionEmoji(emojiName: string | null): boolean {
  return (
    emojiName === SIGNUP_REVIEW_REACTIONS.APPROVED ||
    emojiName === SIGNUP_REVIEW_REACTIONS.DECLINED
  );
}

export function isBotReaction(
  messageAuthorId: string,
  userId: string,
): boolean {
  return messageAuthorId === userId;
}

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
