import { ChatInputCommandInteraction } from 'discord.js';

export class RemoveSignupCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
