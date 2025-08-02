import { ChatInputCommandInteraction } from 'discord.js';

export class EditTurboProgCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
