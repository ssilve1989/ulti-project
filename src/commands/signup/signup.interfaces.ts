import { SignupRequestDto } from './signup-request.dto.js';
import { SignupStatus } from './signup.consts.js';

export interface Signup extends Omit<SignupRequestDto, 'screenshot'> {
  progPoint?: string;
  reviewedBy?: string | null;
  reviewMessageId?: string;
  screenshot?: string | null;
  status: SignupStatus;
}

export type SignupCompositeKeyProps = Pick<Signup, 'discordId' | 'encounter'>;
