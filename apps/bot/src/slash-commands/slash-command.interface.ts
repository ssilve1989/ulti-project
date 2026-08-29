import type { ChatInputCommandInteraction } from 'discord.js';

export interface ISlashCommand {
  execute(interaction: ChatInputCommandInteraction<'cached'>): Promise<void>;
}
