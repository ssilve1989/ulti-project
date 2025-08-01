import { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../../slash-commands.interfaces.js';

export class RetireCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}
