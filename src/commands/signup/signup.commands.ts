import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../slash-commands.interfaces.js';

export class SignupCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}
