import { createMock } from '@golevelup/ts-vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { LookupCommand } from '../lookup/lookup.command.js';
import { SignupCommand } from '../signup/commands/signup.commands.js';
import { RemoveSignupCommand } from '../signup/subcommands/remove-signup/remove-signup.command.js';
import { StatusCommand } from '../status/status.command.js';
import { TurboProgCommand } from '../turboprog/commands/turbo-prog.commands.js';
import { LookupSlashCommand } from './commands/lookup.js';
import { RemoveSignupSlashCommand } from './commands/remove-signup.js';
import { SignupSlashCommand } from './commands/signup.js';
import { StatusSlashCommand } from './commands/status.js';
import { TurboProgSlashCommand } from './commands/turbo-prog-signup.js';
import { getCommandForInteraction } from './slash-commands.utils.js';

const cases = [
  [LookupSlashCommand, LookupCommand],
  [SignupSlashCommand, SignupCommand],
  [StatusSlashCommand, StatusCommand],
  [RemoveSignupSlashCommand, RemoveSignupCommand],
  [TurboProgSlashCommand, TurboProgCommand],
].map(([input, expected]) => ({
  input,
  expected,
  description: `getCommandForInteraction(${input.name}) should return ${expected.name}`,
}));

test.each(cases)('$description', ({ input, expected }) => {
  const interaction = createMock<ChatInputCommandInteraction<'cached' | 'raw'>>(
    {
      commandName: input.name,
      valueOf: () => '',
    },
  );

  const result = getCommandForInteraction(interaction);
  expect(result).toBeInstanceOf(expected);
});
