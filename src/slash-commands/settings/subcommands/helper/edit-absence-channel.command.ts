import { ChatInputCommandInteraction } from 'discord.js';

export class EditAbsenceChannelCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
