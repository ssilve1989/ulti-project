import type { ChatInputCommandInteraction } from 'discord.js';

export class ViewEncounterCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
    public readonly encounterId?: string,
  ) {}
}

export class EncountersCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}
