import { ChatInputCommandInteraction } from 'discord.js';

export class EditEncounterRolesCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
