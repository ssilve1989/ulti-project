import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../commands/slash-commands.interfaces.js';

export class SettingsCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}
