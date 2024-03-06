import { SignupDocument } from '../../../../firebase/models/signup.model.js';

export class UpdateSignupReviewCommand {
  constructor(
    public readonly signup: SignupDocument,
    public readonly messageId: string,
  ) {}
}
