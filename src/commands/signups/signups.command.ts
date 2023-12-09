import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../commands.interfaces.js';

class SignupCommand implements DiscordCommand {
  public static readonly NAME = 'signup';

  constructor(public readonly interaction: ChatInputCommandInteraction) {}
}

export { SignupCommand };
