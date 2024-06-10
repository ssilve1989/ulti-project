import { SignupDocument } from '../../../firebase/models/signup.model.js';

export class SendSignupReviewCommand {
  constructor(
    public readonly signup: SignupDocument,
    public readonly guildId: string,
  ) {}
}
