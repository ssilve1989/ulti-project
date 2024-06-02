import { ICommand } from '@nestjs/cqrs';
import { ChatInputCommandInteraction } from 'discord.js';
import { SettingsDocument } from '../../firebase/models/settings.model.js';
import { DiscordCommand } from '../slash-commands.interfaces.js';
import { TurboProgEntry } from './turbo-prog.interfaces.js';

export class TurboProgCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  ) {}
}

export class TurboProgRemoveSignupCommand implements ICommand {
  constructor(
    public readonly entry: TurboProgEntry,
    public readonly guildId: string,
    public readonly settings: SettingsDocument,
  ) {}
}
