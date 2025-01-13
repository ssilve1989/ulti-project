import type { ChatInputCommandInteraction } from 'discord.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import type { DiscordCommand } from '../slash-commands.interfaces.js';

export class BlacklistAddCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'raw' | 'cached'>,
  ) {}
}

export class BlacklistRemoveCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'raw' | 'cached'>,
  ) {}
}

export class BlacklistDisplayCommand implements DiscordCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'raw' | 'cached'>,
  ) {}
}

export class BlacklistSearchCommand {
  constructor(
    public readonly signup: SignupDocument,
    public readonly guildId: string,
  ) {}
}
