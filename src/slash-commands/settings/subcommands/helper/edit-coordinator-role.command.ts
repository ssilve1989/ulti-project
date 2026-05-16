import { ChatInputCommandInteraction } from 'discord.js';

export class EditCoordinatorRoleCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
