import type { SettingsDocument, SignupDocument } from '@ulti-project/shared';
import { Message, User } from 'discord.js';

export class SignupCreatedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public guildId: string,
  ) {}
}

export class SignupApprovedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly settings: SettingsDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
  ) {}
}

export class SignupDeclinedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
  ) {}
}

export class SignupDeclineReasonCollectedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
    public readonly declineReason?: string,
  ) {}
}

export class SignupApprovalSentEvent {
  constructor(
    public readonly signup: Pick<
      SignupDocument,
      'discordId' | 'character' | 'reviewMessageId'
    >,
    public readonly guildId: string,
  ) {}
}
