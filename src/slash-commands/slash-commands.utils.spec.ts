import { createMock } from '@golevelup/ts-vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { LookupCommand } from '../lookup/lookup.command.js';
import { RemoveRoleCommand } from '../remove-role/remove-role.command.js';
import { SignupCommand } from '../signup/commands/signup.commands.js';
import { RemoveSignupCommand } from '../signup/subcommands/remove-signup/remove-signup.command.js';
import { StatusCommand } from '../status/status.command.js';
import { TurboProgCommand } from '../turboprog/commands/turbo-prog.commands.js';
import { LookupSlashCommand } from './commands/lookup.js';
import { RemoveRoleSlashCommand } from './commands/remove-role.js';
import { REMOVE_SIGNUP_SLASH_COMMAND_NAME } from './commands/remove-signup.js';
import { SIGNUP_SLASH_COMMAND_NAME } from './commands/signup.js';
import { StatusSlashCommand } from './commands/status.js';
import { TURBO_PROG_SLASH_COMMAND_NAME } from './commands/turbo-prog-signup.js';
import { getCommandForInteraction } from './slash-commands.utils.js';

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
