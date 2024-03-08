import { Injectable } from '@nestjs/common';
import { DiscordCommand } from '../slash-commands.interfaces.js';
import { ChatInputCommandInteraction } from 'discord.js';

@Injectable()
class LookupCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}

export { LookupCommand };
