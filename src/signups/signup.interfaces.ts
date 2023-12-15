import { Encounter } from '../app.consts.js';
import { SignupStatus } from './signup.consts.js';

export interface SignupRequest {
  availability: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  fflogsLink: string;
  username: string;
  world: string;
}

export interface Signup extends SignupRequest {
  status: SignupStatus;
  reviewedBy?: string | null;
  reviewMessageId?: string;
}

export type SignupCompositeKeyProps = Pick<Signup, 'username' | 'encounter'>;
