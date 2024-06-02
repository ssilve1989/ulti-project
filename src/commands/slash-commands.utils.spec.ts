import { createMock } from '@golevelup/ts-vitest';
import { ChatInputCommandInteraction } from 'discord.js';
import { LookupCommand } from './lookup/lookup.command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { SignupCommand } from './signup/signup.commands.js';
import { SignupSlashCommand } from './signup/signup.slash-command.js';
import { RemoveSignupCommand } from './signup/subcommands/remove-signup/remove-signup.command.js';
import { RemoveSignupSlashCommand } from './signup/subcommands/remove-signup/remove-signup.slash-command.js';
import { getCommandForInteraction } from './slash-commands.utils.js';
import { StatusCommand } from './status/status.command.js';
import { StatusSlashCommand } from './status/status.slash-command.js';
import { TurboProgCommand } from './turboprog/turbo-prog.commands.js';
import { TurboProgSlashCommand } from './turboprog/turbo-prog.slash-command.js';

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
