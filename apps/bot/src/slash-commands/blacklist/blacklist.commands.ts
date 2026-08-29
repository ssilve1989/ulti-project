import type { SignupDocument } from '@ulti-project/shared';

export class BlacklistSearchCommand {
  constructor(
    public readonly signup: Pick<
      SignupDocument,
      'discordId' | 'character' | 'reviewMessageId'
    >,
    public readonly guildId: string,
  ) {}
}
