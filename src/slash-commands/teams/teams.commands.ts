import type { ChatInputCommandInteraction } from 'discord.js';

export class TeamsCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
