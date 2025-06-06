import { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../../../../slash-commands/slash-commands.interfaces.js';

export class EditEncounterRolesCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}
