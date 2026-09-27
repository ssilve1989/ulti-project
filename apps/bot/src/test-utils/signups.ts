import {
  Encounter,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { SignupCollection } from '../firebase/collections/signup.collection.js';
import type { FlowApp } from './flow-app.js';

/**
 * Stores a signup as the signup flow writes one: pending review unless
 * `signup` says otherwise (a reviewed one comes with its prog point and party
 * status). Returns what was stored.
 */
export function seedSignup(
  flow: FlowApp,
  signup: Partial<SignupDocument>,
): SignupDocument {
  const stored: SignupDocument = {
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
    status: SignupStatus.PENDING,
    ...signup,
  };
  flow.db.seed(`signups/${SignupCollection.getKeyForSignup(stored)}`, stored);
  return stored;
}
