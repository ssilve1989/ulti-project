import { Signup } from '../signup.interfaces.js';

export class SendSignupReviewCommand {
  constructor(public readonly signup: Signup) {}
}
