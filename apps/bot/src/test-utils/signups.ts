import {
  type ApprovedSignupDocument,
  type DeclinedSignupDocument,
  Encounter,
  type PendingSignupDocument,
  type SignupDocument,
  SignupStatus,
  type UpdatePendingSignupDocument,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { SignupCollection } from '#src/firebase/collections/signup.collection.js';
import type { FlowApp } from './flow-app.js';

export type ApprovedSeed = Partial<ApprovedSignupDocument> &
  Pick<ApprovedSignupDocument, 'status'>;

export type SeedOverrides =
  | Partial<PendingSignupDocument>
  | (Partial<UpdatePendingSignupDocument> &
      Pick<UpdatePendingSignupDocument, 'status'>)
  | ApprovedSeed
  | (Partial<DeclinedSignupDocument> & Pick<DeclinedSignupDocument, 'status'>);

const DEFAULT_REVIEWER = 'reviewer';

/**
 * Stores a signup with the fields the signup flow writes: pending review
 * unless `signup` says otherwise (a reviewed one comes with its prog point and
 * party status, and a reviewer). Returns what was stored.
 */
export function seedSignup(
  flow: FlowApp,
  signup: ApprovedSeed,
): ApprovedSignupDocument;
export function seedSignup(
  flow: FlowApp,
  signup: SeedOverrides,
): SignupDocument;
export function seedSignup(
  flow: FlowApp,
  signup: SeedOverrides,
): SignupDocument {
  const base = {
    character: 'flow tester',
    discordId: 'player-1',
    encounter: Encounter.DSR,
    notes: null,
    proofOfProgLink: 'https://www.fflogs.com/reports/abc123',
    progPointRequested: 'P6 Wroth Flames',
    role: 'tank',
    screenshot: null,
    username: 'player',
    world: 'jenova',
    expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    reviewMessageId: 'review-message-1',
  };
  const stored: SignupDocument =
    signup.status === SignupStatus.APPROVED ||
    signup.status === SignupStatus.DECLINED
      ? { ...base, reviewedBy: DEFAULT_REVIEWER, ...signup }
      : signup.status === SignupStatus.UPDATE_PENDING
        ? { ...base, ...signup }
        : { ...base, status: SignupStatus.PENDING, ...signup };
  flow.db.seed(`signups/${SignupCollection.getKeyForSignup(stored)}`, stored);
  return stored;
}
