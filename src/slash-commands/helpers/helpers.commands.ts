import type { ChatInputCommandInteraction } from 'discord.js';

export class HelpersCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
