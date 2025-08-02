import { Injectable } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@Injectable()
class CleanRolesCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export { CleanRolesCommand };
