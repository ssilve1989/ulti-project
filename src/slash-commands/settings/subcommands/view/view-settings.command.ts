import { ChatInputCommandInteraction } from 'discord.js';

export class ViewSettingsCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
