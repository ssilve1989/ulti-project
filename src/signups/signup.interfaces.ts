import { SignupRequestDto } from './dto/signup-request.dto.js';
import { SignupStatus } from './signup.consts.js';

export interface Signup extends Omit<SignupRequestDto, 'screenshot'> {
  status: SignupStatus;
  reviewedBy?: string | null;
  reviewMessageId?: string;
  screenshot?: string | null;
}

export type SignupCompositeKeyProps = Pick<
  Signup,
  'character' | 'world' | 'encounter'
>;
