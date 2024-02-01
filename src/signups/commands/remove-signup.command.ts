import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../../slash-commands/slash-commands.interfaces.js';

export class RemoveSignupCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}
