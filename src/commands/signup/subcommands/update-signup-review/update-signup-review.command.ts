import { Signup } from '../../signup.interfaces.js';

export class UpdateSignupReviewCommand {
  constructor(
    public readonly signup: Signup,
    public readonly messageId: string,
  ) {}
}
