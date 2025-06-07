import { createMock } from '@golevelup/ts-vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { LookupCommand } from './lookup/lookup.command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { RemoveRoleCommand } from './remove-role/remove-role.command.js';
import { RemoveRoleSlashCommand } from './remove-role/remove-role.slash-command.js';
import { SignupCommand } from './signup/commands/signup.commands.js';
import { SIGNUP_SLASH_COMMAND_NAME } from './signup/signup.slash-command.js';
import { RemoveSignupCommand } from './signup/subcommands/remove-signup/remove-signup.command.js';
import { REMOVE_SIGNUP_SLASH_COMMAND_NAME } from './signup/subcommands/remove-signup/remove-signup.slash-command.js';
import { getCommandForInteraction } from './slash-commands.utils.js';
import { StatusCommand } from './status/status.command.js';
import { StatusSlashCommand } from './status/status.slash-command.js';
import { TurboProgCommand } from './turboprog/commands/turbo-prog.commands.js';
import { TURBO_PROG_SLASH_COMMAND_NAME } from './turboprog/turbo-prog-signup.slash-command.js';

// TODO: add subcommand functionality
const cases = [
  [LookupSlashCommand.name, LookupCommand] as const,
  [REMOVE_SIGNUP_SLASH_COMMAND_NAME, RemoveSignupCommand] as const,
  [RemoveRoleSlashCommand.name, RemoveRoleCommand] as const,
  [SIGNUP_SLASH_COMMAND_NAME, SignupCommand] as const,
  [StatusSlashCommand.name, StatusCommand] as const,
  [TURBO_PROG_SLASH_COMMAND_NAME, TurboProgCommand] as const,
].map(([input, expected]) => ({
  input,
  expected,
  description: `getCommandForInteraction(${input}) should return ${expected.name}`,
}));

test.each(cases)('$description', ({ input, expected }) => {
  const interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>(
    {
      commandName: input,
      valueOf: () => '',
    },
  );

  const result = getCommandForInteraction(interaction);
  expect(result).toBeInstanceOf(expected);
});
