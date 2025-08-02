import { ChatInputCommandInteraction } from 'discord.js';

export class EditSpreadsheetCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
