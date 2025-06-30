import type { ChatInputCommandInteraction } from 'discord.js';

export class SetThresholdsCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    public readonly encounterId: string,
  ) {}
}

export class ManageProgPointsCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    public readonly encounterId: string,
  ) {}
}

export class ViewEncounterCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    public readonly encounterId?: string,
  ) {}
}

export class EncountersCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}
