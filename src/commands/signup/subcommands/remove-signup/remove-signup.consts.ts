import { RemoveSignupDto } from './remove-signup.dto.js';

export const REMOVAL_SUCCESS =
  'Success! If you signed up prior to the bots release, confirm with a coordinator that you are removed from the Google Sheet!';

export const REMOVAL_MISSING_PERMISSIONS =
  'You do not have permission to remove this signup';

export const REMOVAL_NO_SHEET_ENTRY = ({
  character,
  world,
  encounter,
}: RemoveSignupDto) =>
  `No entry found in the spreadsheet for \`${character}@${world}\` for \`${encounter}\`. If you feel this is an error please reach out to a coordinator.`;

export const REMOVAL_NO_DB_ENTRY = ({
  character,
  world,
  encounter,
}: RemoveSignupDto) =>
  `:exclamation: No entry found in database for \`${character}@${world}\` for \`${encounter}\`. Please check for typos. Additionally this command will only work for signups that have gone through the \`/signup\` command. If you have signed up prior to the bots release please reach out to a coordinator to be removed from the sheet.`;
