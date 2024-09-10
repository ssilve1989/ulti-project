import { BlacklistSlashCommand } from './commands/blacklist.js';
import { LookupSlashCommand } from './commands/lookup.js';
import { RemoveRoleSlashCommand } from './commands/remove-role.js';
import { RemoveSignupSlashCommand } from './commands/remove-signup.js';
import { SettingsSlashCommand } from './commands/settings.js';
import { SignupSlashCommand } from './commands/signup.js';
import { StatusSlashCommand } from './commands/status.js';
import { TurboProgSlashCommand } from './commands/turbo-prog-signup.js';

export const SLASH_COMMANDS = [
  BlacklistSlashCommand,
  RemoveRoleSlashCommand,
  LookupSlashCommand,
  RemoveSignupSlashCommand,
  SettingsSlashCommand,
  SignupSlashCommand,
  StatusSlashCommand,
  TurboProgSlashCommand,
];
