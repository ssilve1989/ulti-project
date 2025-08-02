import { ChatInputCommandInteraction } from 'discord.js';

export class EditReviewerCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
