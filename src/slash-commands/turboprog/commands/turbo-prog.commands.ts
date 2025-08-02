import type { ICommand } from '@nestjs/cqrs';
import { ChatInputCommandInteraction } from 'discord.js';
import type { TurboProgEntry } from '../turbo-prog.interfaces.js';

export class TurboProgCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export class TurboProgRemoveSignupCommand implements ICommand {
  constructor(
    public readonly entry: Pick<TurboProgEntry, 'encounter' | 'character'>,
    public readonly guildId: string,
  ) {}
}
