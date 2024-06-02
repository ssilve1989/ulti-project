import { ChatInputCommandInteraction } from 'discord.js';
import { match } from 'ts-pattern';
import { LookupCommand } from './lookup/lookup.command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { SettingsSlashCommand } from './settings/settings.slash-command.js';
import { EditSettingsCommand } from './settings/subcommands/edit-settings.command.js';
import { ViewSettingsCommand } from './settings/subcommands/view-settings.command.js';
import { SignupCommand } from './signup/signup.commands.js';
import { SignupSlashCommand } from './signup/signup.slash-command.js';
import { RemoveSignupCommand } from './signup/subcommands/remove-signup/remove-signup.command.js';
import { RemoveSignupSlashCommand } from './signup/subcommands/remove-signup/remove-signup.slash-command.js';
import { DiscordCommand } from './slash-commands.interfaces.js';
import { StatusCommand } from './status/status.command.js';
import { StatusSlashCommand } from './status/status.slash-command.js';
import { TurboProgCommand } from './turboprog/turbo-prog.command.js';
import { TurboProgSlashCommand } from './turboprog/turbo-prog.slash-command.js';

/**
 * Get the CQRS command from the given interaction
 * @param interaction
 * @returns The command to execute or undefined if no command was found
 */

export function getCommandForInteraction(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
): DiscordCommand | undefined {
  return match(interaction.commandName)
    .with(LookupSlashCommand.name, () => new LookupCommand(interaction))
    .with(SignupSlashCommand.name, () => new SignupCommand(interaction))
    .with(StatusSlashCommand.name, () => new StatusCommand(interaction))
    .with(SettingsSlashCommand.name, () => {
      const subcommand = interaction.options.getSubcommand();
      return match(subcommand)
        .with('edit', () => new EditSettingsCommand(interaction))
        .with('view', () => new ViewSettingsCommand(interaction))
        .run();
    })
    .with(
      RemoveSignupSlashCommand.name,
      () => new RemoveSignupCommand(interaction),
    )
    .with(TurboProgSlashCommand.name, () => new TurboProgCommand(interaction))
    .otherwise(() => undefined);
}
