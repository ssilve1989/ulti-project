import { SignupDocument } from '../../firebase/models/signup.model.js';

export class SignupEvent {
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
