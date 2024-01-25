export const SIGNUP_MESSAGES = {
  CONFIRMATION_TIMEOUT:
    'Confirmation not received within 1 minute, cancelling signup. Please use /signup if you wish to try again.',
  SIGNUP_SUBMISSION_CANCELLED:
    'Signup canceled. Please use /signup if you wish to try again.',
  SIGNUP_SUBMISSION_CONFIRMED:
    'Confirmed! A coordinator will review your submission and reach out to you soon. You can use `/status` to review the state of your signups.',
  MISSING_SIGNUP_REVIEW_CHANNEL:
    'A review channel has not been configured for this bot. Please contact an administrator',
};

export const SIGNUP_REVIEW_REACTIONS: Record<
  keyof typeof SignupStatus,
  string
> = {
  APPROVED: '✅',
  DECLINED: '❌',
  PENDING: ':question:',
};

export enum SignupStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
}
