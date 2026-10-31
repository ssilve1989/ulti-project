import type {
  ApprovedSignupDocument,
  DeclinedSignupDocument,
  SignupDocument,
} from '@ulti-project/shared';
import { Message, User } from 'discord.js';
import type { SettingsDocument } from '#src/firebase/models/settings.model.js';

export class SignupCreatedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public guildId: string,
  ) {}
}

export class SignupApprovedEvent {
  constructor(
    public readonly signup: ApprovedSignupDocument,
    public readonly settings: SettingsDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
    public readonly comment?: string,
  ) {}
}

export class SignupDeclinedEvent {
  constructor(
    public readonly signup: DeclinedSignupDocument,
    public readonly reviewedBy: User,
    public readonly message: Message<true>,
  ) {}
}

export class SignupDeclineReasonCollectedEvent {
  constructor(
    public readonly signup: DeclinedSignupDocument,
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
