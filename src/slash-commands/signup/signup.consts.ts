import type { SignupStatusValues } from '../../firebase/models/signup.model.js';

export const SIGNUP_MESSAGES = {
  CONFIRMATION_TIMEOUT:
    'Confirmation not received within 1 minute, cancelling signup. Please use /signup if you wish to try again.',
  MISSING_SIGNUP_REVIEW_CHANNEL:
    'A review channel has not been configured for this bot. Please contact an administrator',
  MISSING_SETTINGS:
    'No settings have been configured for this bot. Commands may not function until properly configured',
  PROG_DM_TIMEOUT:
    'You did not respond in time. The signup has not been approved. Please react to the message again to approve this signup',
  SIGNUP_SUBMISSION_CANCELLED:
    'Signup canceled. Please use /signup if you wish to try again.',
  SIGNUP_SUBMISSION_CONFIRMED: `Your signup has been successfully submitted! 🎉. You can use 
    \`/status\` to review the state of your signups.

    **Common Questions:**
    • How can I update my signup? \`/signup\` again with the updated information.
    • What do I do if I cleared? You can submit again with your prog point as "Cleared" or use the \`/remove-signup\` command.
    • What do I do if I don't want to be signed up anymore? You can use the \`/remove-signup\` command.
    `,
  // TODO: Find a CMS-esque type of way of managing this rather than hardcoding these reasons
  SIGNUP_SUBMISSION_DENIED: `
We're sorry but your signup could not currently be approved. Possible reasons include:
- Signup doesn't meet new qualifications. Check <#1074471023178686514> for the latest information
- Signup lacks valid proof of requested prog point. Tomestone pictures alone do not count!
- You already cleared the encounter you signed-up for
- Mechanics prior to the requested prog point not performed cleanly
You can reach out to a coordinator to discuss any issues.
`,
  UNEXPECTED_PROG_SELECTION_ERROR:
    'Sorry an unexpected error has occurred. Please report this problem and manually update the google sheet with the intended prog point',
  PROG_SELECTION_TIMEOUT:
    'Your response timed out and could not be recorded to set the prog point for this signup. The signup has not been added to the googlesheet since we could not determine what kind party it should be, please add it manually.',
  GENERIC_APPROVAL_ERROR:
    'An error occurred while processing your response. The signup may not have been added to the Google Sheet, please verify it or add it manually',
  SIGNUP_NOT_FOUND_FOR_REACTION:
    'No signup was found in the database to correspond to this reaction. Check if you are reacting to a message that has already been handled, like a Cleared post. In those cases the document would be removed. If not please report this error.',
} as const;

export const SIGNUP_REVIEW_REACTIONS: Record<SignupStatusValues, string> = {
  APPROVED: '✅',
  DECLINED: '❌',
  PENDING: ':question:',
  UPDATE_PENDING: ':question:',
};

// string validation via IsUrl does not work the same as regex. It does like
// this weird strict equality wheras regex just looks at the hostname portion?
// In any case, we just use regexes for now
export const PROG_PROOF_HOSTS_WHITELIST = [
  /fflogs.com/,
  /medal.tv/,
  /streamable.com/,
  /twitch.tv/,
  /youtube.com/,
];

// which makes us need to do this mapping for presentation
export const WHITELIST_VALIDATION_ERROR = `A link must be from one of these domains:
${PROG_PROOF_HOSTS_WHITELIST.map((v) => v.source.replaceAll('/', '')).join(
  '\n',
)}`;

// Predefined decline reasons for signup reviews
export const SIGNUP_DECLINE_REASONS_CONFIG: ReadonlyArray<{
  readonly reason: string;
  readonly permanent: boolean;
  readonly followupMessage: string;
}> = [
  {
    reason: 'Signup lacks valid proof of requested prog point',
    permanent: false,
    followupMessage:
      "Please review the feedback above and feel free to submit a new signup once you've addressed the concerns. Thank you for your understanding! 🙏",
  },
  {
    reason: 'The encounter has already been cleared',
    permanent: true,
    followupMessage:
      "Since you've already cleared this encounter, you won't be able to sign up for it again. Congratulations on your clear! 🎉",
  },
  {
    reason:
      'Mechanics prior to the requested prog point have not been performed cleanly',
    permanent: false,
    followupMessage:
      "Please review the feedback above and feel free to submit a new signup once you've addressed the concerns. Thank you for your understanding! 🙏",
  },
];

// Extract just the reason strings for backwards compatibility
export const SIGNUP_DECLINE_REASONS: string[] =
  SIGNUP_DECLINE_REASONS_CONFIG.map((config) => config.reason);

// Default followup messages for cases without predefined messages
export const DEFAULT_DECLINE_FOLLOWUP_MESSAGES = {
  permanent:
    'This decline reason indicates a permanent condition that cannot be changed.',
  nonPermanent:
    "Please review the feedback above and feel free to submit a new signup once you've addressed the concerns. Thank you for your understanding! 🙏",
} as const;

// Custom reason option for select menu
export const CUSTOM_DECLINE_REASON_VALUE = 'custom_reason';
export const CUSTOM_DECLINE_REASON_LABEL = 'Other - provide custom reason';

// FFLogs report validation constants
export const FFLOGS_REPORT_MAX_AGE_DAYS = 28;
export const FFLOGS_VALIDATION_ERROR_PREFIX =
  'FFLogs report validation failed:';
