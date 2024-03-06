import { Signup } from '../../signup.interfaces.js';

export class SendSignupReviewCommand {
  constructor(
    public readonly signup: Signup,
    public readonly guildId: string,
  ) {}
}
