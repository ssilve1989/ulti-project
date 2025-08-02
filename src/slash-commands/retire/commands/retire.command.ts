import { ChatInputCommandInteraction } from 'discord.js';

export class RetireCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
