import { ChatInputCommandInteraction } from 'discord.js';

// TODO: make base class for all commands
export interface DiscordCommand {
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>;
}
