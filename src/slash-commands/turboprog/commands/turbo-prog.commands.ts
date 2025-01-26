import type { ICommand } from '@nestjs/cqrs';
import { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../../slash-commands.interfaces.js';
import type { TurboProgEntry } from '../turbo-prog.interfaces.js';

export class TurboProgCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}

export class TurboProgRemoveSignupCommand implements ICommand {
  constructor(
    public readonly entry: Pick<TurboProgEntry, 'encounter' | 'character'>,
    public readonly guildId: string,
  ) {}
}
