import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import type { SignupCreatedEventOptions } from '../../events/signup.events.js';

export class SendSignupReviewCommand {
  constructor(
    public readonly signup: SignupDocument,
    public readonly guildId: string,
    public readonly options: SignupCreatedEventOptions,
  ) {}
}
