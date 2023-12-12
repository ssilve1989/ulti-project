import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../../commands/commands.interfaces.js';

export class StatusCommand implements DiscordCommand {
  public static readonly NAME = 'status';
  constructor(public readonly interaction: ChatInputCommandInteraction) {}
}
