import type { SignupDocument } from '@ulti-project/shared';

export class SendSignupReviewCommand {
  constructor(
    public readonly signup: SignupDocument,
    public readonly guildId: string,
  ) {}
}
