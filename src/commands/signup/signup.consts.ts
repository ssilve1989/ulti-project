import { SignupStatus } from '../../firebase/models/signup.model.js';

export const SIGNUP_MESSAGES = {
  CONFIRMATION_TIMEOUT:
    'Confirmation not received within 1 minute, cancelling signup. Please use /signup if you wish to try again.',
  MISSING_SIGNUP_REVIEW_CHANNEL:
    'A review channel has not been configured for this bot. Please contact an administrator',
  MISSING_SETTINGS:
    'No settings have been configured for this bot. Commands may not function until properly configured',
  PROG_DM_TIMEOUT:
    "You didn't respond in time. Please manually update the google sheet with the intended prog point",
  SIGNUP_SUBMISSION_CANCELLED:
    'Signup canceled. Please use /signup if you wish to try again.',
  SIGNUP_SUBMISSION_CONFIRMED:
    'Confirmed! A coordinator will review your submission and reach out to you soon. You can use `/status` to review the state of your signups.',
  // TODO: Find a CMS-esque type of way of managing this rather than hardcoding these reasons
  SIGNUP_SUBMISSION_DENIED: `
Your signup has been denied. Possible reasons:
- Signup doesn't meet new qualifications. Check <#1128721088017346622> for the latest information
- Signup lacks valid proof of progpoint
- You already cleared the encounter you signed-up for
You can reach out to a coordinator to discuss any issues.
`,
  UNEXPECTED_PROG_SELECTION_ERROR:
    'Sorry an unexpected error has occurred. Please report this problem and manually update the google sheet with the intended prog point',
  PROG_SELECTION_TIMEOUT:
    'Your response timed out and could not be recorded to set the prog point for this signup. The signup has not been added to the googlesheet since we could not determine what kind party it should be, please add it manually.',
  GENERIC_APPROVAL_ERROR:
    'An error occurred while processing your response. The signup may not have been added to the Google Sheet, please verify it or add it manually',
};

export const SIGNUP_REVIEW_REACTIONS: Record<
  keyof typeof SignupStatus,
  string
> = {
  APPROVED: '✅',
  DECLINED: '❌',
  PENDING: ':question:',
};
