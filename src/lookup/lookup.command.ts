import { Injectable } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';
import { DiscordCommand } from '../slash-commands/slash-commands.interfaces.js';

@Injectable()
class LookupCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}

export { LookupCommand };
