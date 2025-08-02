import type { SignupDocument } from '../../firebase/models/signup.model.js';

export interface TurboProgEntry
  extends Pick<SignupDocument, 'character' | 'encounter'> {
  job: string;
  progPoint: string;
}
