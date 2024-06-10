import { SignupDocument } from '../firebase/models/signup.model.js';

export interface TurboProgEntry
  extends Pick<SignupDocument, 'character' | 'availability' | 'encounter'> {
  job: string;
  progPoint: string;
}
