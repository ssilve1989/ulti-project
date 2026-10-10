import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';

export interface ISlashCommand {
  execute(interaction: ChatInputCommandInteraction<'cached'>): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction<'cached'>): Promise<void>;
}
