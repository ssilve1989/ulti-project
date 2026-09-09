export const EDIT_SIGNUP_MESSAGES = {
  MISSING_SETTINGS:
    'This server is not configured for signup review yet. A coordinator needs to set the reviewer role and review channel first.',

  MISSING_PERMISSIONS:
    'You do not have permission to edit reviewed signups. Only reviewers can use this command.',

  NOT_FOUND:
    'No reviewed signup found for that user/character. Check the spelling, and note only already-approved or already-declined signups can be edited here.',

  AMBIGUOUS:
    'That user/character has more than one reviewed signup. Re-run the command and pass the `encounter` option to pick one.',

  REVIEW_MESSAGE_MISSING:
    'The original review message for this signup is gone, so the edit cannot be applied.',

  NO_CHANGES:
    'Nothing to change — the prog point and approval decision you picked match the current signup.',

  CANCELLED: 'Edit cancelled. Nothing was changed.',

  TIMEOUT: 'Timed out waiting for a response. Nothing was changed.',

  SUCCESS_TITLE: 'Signup Updated',
} as const;
