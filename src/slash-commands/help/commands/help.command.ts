import { Injectable } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@Injectable()
class HelpCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export { HelpCommand };
