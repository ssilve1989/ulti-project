import { ChatInputCommandInteraction } from 'discord.js';

export interface DiscordCommand {
  interaction: ChatInputCommandInteraction;
}
