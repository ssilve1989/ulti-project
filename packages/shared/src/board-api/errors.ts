import type { BoardParticipant } from './events.ts';

/** Every error body the board API answers with: `{ reason }`, and for `claimed` the claim that won. */
export type BoardErrorBody =
  | {
      reason:
        | 'signed-out'
        | 'not-in-guild'
        | 'no-role'
        | 'no-squad'
        | 'squad-conflict'
        | 'json-required'
        | 'not-found'
        | 'closed'
        | 'not-your-claim'
        | 'invalid-json'
        | 'bad-request'
        | 'payload-too-large'
        | 'unsupported-media-type'
        | 'internal';
    }
  | {
      reason: 'claimed';
      claim: NonNullable<BoardParticipant['claim']>;
    };
