import { ChatInputCommandInteraction } from 'discord.js';

export class EditChannelsCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
