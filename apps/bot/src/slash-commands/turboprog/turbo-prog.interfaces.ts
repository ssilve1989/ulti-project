import type { SignupDocument } from '@ulti-project/shared';

export interface TurboProgEntry
  extends Pick<SignupDocument, 'character' | 'encounter'> {
  job: string;
  progPoint: string;
}
