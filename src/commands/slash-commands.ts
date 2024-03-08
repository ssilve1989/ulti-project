import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { SettingsSlashCommand } from './settings/settings-slash-command.js';
import { SignupSlashCommand } from './signup/signup-slash-command.js';
import { RemoveSignupSlashCommand } from './signup/subcommands/remove-signup/remove-signup-slash-command.js';
import { StatusSlashCommand } from './status/status-slash-command.js';

export const SLASH_COMMANDS = [
  LookupSlashCommand,
  RemoveSignupSlashCommand,
  SettingsSlashCommand,
  SignupSlashCommand,
  StatusSlashCommand,
];
