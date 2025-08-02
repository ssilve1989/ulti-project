import { ChatInputCommandInteraction } from 'discord.js';

export class StatusCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
