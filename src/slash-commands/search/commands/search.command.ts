import { Injectable } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@Injectable()
class SearchCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export { SearchCommand };
