import type { SignupDocument } from '../../firebase/models/signup.model.js';

export class BlacklistSearchCommand {
  constructor(
    public readonly signup: Pick<
      SignupDocument,
      'discordId' | 'character' | 'reviewMessageId'
    >,
    public readonly guildId: string,
  ) {}
}
