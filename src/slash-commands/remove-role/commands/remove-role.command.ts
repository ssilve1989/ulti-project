import { Injectable } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@Injectable()
class RemoveRoleCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export { RemoveRoleCommand };
