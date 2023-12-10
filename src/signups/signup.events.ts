import { Signup } from './signup.interfaces.js';

export class SignupEvent {
  constructor(public readonly signup: Signup) {}
}

export class SignupReviewCreatedEvent {
  constructor(
    public readonly signup: Signup,
    public readonly messageId: string,
  ) {}
}
