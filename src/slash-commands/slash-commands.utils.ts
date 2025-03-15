import { ChatInputCommandInteraction } from 'discord.js';
import { match } from 'ts-pattern';
import {
  BlacklistAddCommand,
  BlacklistDisplayCommand,
  BlacklistRemoveCommand,
} from './blacklist/blacklist.commands.js';
import { BlacklistSlashCommand } from './blacklist/blacklist.slash-command.js';
import { LookupCommand } from './lookup/lookup.command.js';
import { LookupSlashCommand } from './lookup/lookup.slash-command.js';
import { RemoveRoleCommand } from './remove-role/remove-role.command.js';
import { RemoveRoleSlashCommand } from './remove-role/remove-role.slash-command.js';
import { RetireCommand } from './retire/retire.command.js';
import { RetireSlashCommand } from './retire/retire.slash-command.js';
import { SearchCommand } from './search/search.command.js';
import { SearchSlashCommand } from './search/search.slash-command.js';
import { SettingsSlashCommand } from './settings/settings.slash-command.js';
import { EditSettingsCommand } from './settings/subcommands/edit/edit-settings.command.js';
import { ViewSettingsCommand } from './settings/subcommands/view/view-settings.command.js';
import { SignupCommand } from './signup/commands/signup.commands.js';
import { SIGNUP_SLASH_COMMAND_NAME } from './signup/signup.slash-command.js';
import { RemoveSignupCommand } from './signup/subcommands/remove-signup/remove-signup.command.js';
import { REMOVE_SIGNUP_SLASH_COMMAND_NAME } from './signup/subcommands/remove-signup/remove-signup.slash-command.js';
import type { DiscordCommand } from './slash-commands.interfaces.js';
import { StatusCommand } from './status/status.command.js';
import { StatusSlashCommand } from './status/status.slash-command.js';
import { TurboProgCommand } from './turboprog/commands/turbo-prog.commands.js';
import { TURBO_PROG_SLASH_COMMAND_NAME } from './turboprog/turbo-prog-signup.slash-command.js';

/**
 * Get the CQRS command from the given interaction
 * @param interaction
 * @returns The command to execute or undefined if no command was found
 */

export function getCommandForInteraction(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
): DiscordCommand | undefined {
  return match(interaction.commandName)
    .with(BlacklistSlashCommand.name, () => {
      const subcommand = interaction.options.getSubcommand();
      return match(subcommand)
        .with('add', () => new BlacklistAddCommand(interaction))
        .with('remove', () => new BlacklistRemoveCommand(interaction))
        .with('display', () => new BlacklistDisplayCommand(interaction))
        .run();
    })
    .with(LookupSlashCommand.name, () => new LookupCommand(interaction))
    .with(SIGNUP_SLASH_COMMAND_NAME, () => new SignupCommand(interaction))
    .with(StatusSlashCommand.name, () => new StatusCommand(interaction))
    .with(RetireSlashCommand.name, () => new RetireCommand(interaction))
    .with(SearchSlashCommand.name, () => new SearchCommand(interaction))
    .with(SettingsSlashCommand.name, () => {
      const subcommand = interaction.options.getSubcommand();
      return match(subcommand)
        .with('edit', () => new EditSettingsCommand(interaction))
        .with('view', () => new ViewSettingsCommand(interaction))
        .run();
    })
    .with(
      REMOVE_SIGNUP_SLASH_COMMAND_NAME,
      () => new RemoveSignupCommand(interaction),
    )
    .with(
      TURBO_PROG_SLASH_COMMAND_NAME,
      () => new TurboProgCommand(interaction),
    )
    .with(RemoveRoleSlashCommand.name, () => new RemoveRoleCommand(interaction))
    .otherwise(() => undefined);
}
