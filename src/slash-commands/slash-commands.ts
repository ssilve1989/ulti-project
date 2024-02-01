import { RemoveSignupSlashCommand } from './remove-signup-slash-command.js';
import { SettingsSlashCommand } from './settings-slash-command.js';
import { SignupSlashCommand } from './signup-slash-command.js';
import { StatusSlashCommand } from './status-slash-command.js';

export const SLASH_COMMANDS = [
  RemoveSignupSlashCommand,
  SettingsSlashCommand,
  SignupSlashCommand,
  StatusSlashCommand,
];
