import {
  type Encounter,
  EncounterFriendlyDescription,
  type PartyStatus,
} from '@ulti-project/shared';
import { userMention } from 'discord.js';
import { titleCase } from 'title-case';

export const EDIT_SIGNUP_SLASH_COMMAND_NAME = 'edit-signup';

export const EDIT_SAVE_BUTTON_ID = 'editSignupSave';
export const EDIT_SAVE_WITH_COMMENT_BUTTON_ID = 'editSignupSaveWithComment';
export const EDIT_CANCEL_BUTTON_ID = 'editSignupCancel';

// same window as the approval decision DM
export const EDIT_SIGNUP_TIMEOUT_MS = 5 * 60 * 1000;

// Discord "Unknown interaction": the click's token expired before showModal
export const DISCORD_UNKNOWN_INTERACTION = 10062;

export const EDIT_SIGNUP_MESSAGES = {
  MISSING_REVIEWER_ROLE: 'No reviewer role has been configured.',
  NOT_A_REVIEWER: 'Only reviewers can edit signups.',
  CANCELLED: 'Edit cancelled — nothing was changed.',
  TIMED_OUT: 'Edit timed out — nothing was changed.',
  SAVING: 'Saving…',
  CHANGES_REQUIRED_BEFORE_SAVE:
    'Select a prog point that changes something before saving.',
  CONFLICT:
    'This signup changed while you were editing (re-submitted or edited by another reviewer). Nothing was saved — run `/edit-signup` again.',
  MODAL_TOKEN_EXPIRED:
    'That took a moment too long to open — please click the comment button again.',
  NO_CHANGES: 'No changes',
  SAVED_TITLE: 'Signup Updated',
  ANNOUNCEMENT_NOT_LINKED:
    "This signup's public approval post isn't linked, so it can't be edited. If it was just approved, try again in a moment; otherwise ask the applicant to re-submit so it can be re-approved.",
} as const;

export function notFoundMessage(discordId: string, encounter: Encounter) {
  return `No signup found for ${userMention(discordId)} in ${EncounterFriendlyDescription[encounter]}. Cleared or removed signups can't be edited.`;
}

export function reviewPendingMessage(reviewMessageUrl: string | undefined) {
  const message =
    'This signup has an open review — react to the review message instead.';
  return reviewMessageUrl ? `${message} ${reviewMessageUrl}` : message;
}

export function sheetsErrorMessage(
  character: string,
  partyStatus: PartyStatus,
  progPointLabel: string,
) {
  return `Saved, but the Google Sheet couldn't be updated. Please set **${titleCase(character)}** to **${partyStatus} · ${progPointLabel}** manually.`;
}
