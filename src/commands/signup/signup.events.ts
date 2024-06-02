import { User } from 'discord.js';
import { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SignupDocument } from '../../firebase/models/signup.model.js';

export class SignupCreatedEvent {
  constructor(
    public readonly signup: SignupDocument,
    public guildId: string,
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
    public guildId: string,
    public readonly settings: SettingsDocument,
    public readonly approvedBy: User,
  ) {}
}
