import { Injectable } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@Injectable()
class LookupCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export { LookupCommand };
