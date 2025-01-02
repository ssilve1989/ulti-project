import { Message, User } from 'discord.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';

export interface SignupCreatedEventOptions {
  includeNotes?: boolean;
}

export class SignupCreatedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public guildId: string,
    public options: SignupCreatedEventOptions,
  ) {}
}

export class SignupReviewCreatedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public readonly messageId: string,
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
