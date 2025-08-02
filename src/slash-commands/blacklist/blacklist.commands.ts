import type { ChatInputCommandInteraction } from 'discord.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';

export class BlacklistAddCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export class BlacklistRemoveCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export class BlacklistDisplayCommand {
  constructor(
    public readonly interaction: ChatInputCommandInteraction<'cached'>,
  ) {}
}

export class BlacklistSearchCommand {
  constructor(
    public readonly signup: Pick<
      SignupDocument,
      'discordId' | 'character' | 'reviewMessageId'
    >,
    public readonly guildId: string,
  ) {}
}
