import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { Encounter } from '../../encounters/encounters.consts.ts';
import {
  isAwaitingReview,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from './signup.model.ts';

const base = Object.freeze({
  character: 'Alpha',
  discordId: '123',
  encounter: Encounter.TOP,
  expiresAt: Timestamp.fromMillis(0),
  progPointRequested: 'P6 Enrage',
  role: 'WAR',
  username: 'AlphaUser',
  world: 'Gilgamesh',
});

const signups = {
  pending: { ...base, status: SignupStatus.PENDING },
  updatePending: {
    ...base,
    status: SignupStatus.UPDATE_PENDING,
    progPoint: 'P5',
    partyStatus: PartyStatus.ProgParty,
  },
  approved: {
    ...base,
    status: SignupStatus.APPROVED,
    reviewedBy: 'reviewer',
    progPoint: 'P6',
    partyStatus: PartyStatus.ProgParty,
  },
  declined: {
    ...base,
    status: SignupStatus.DECLINED,
    reviewedBy: 'reviewer',
    declineReason: 'no proof',
  },
} satisfies Record<string, SignupDocument>;

describe('isAwaitingReview', () => {
  it.each([
    ['pending', true],
    ['updatePending', true],
    ['approved', false],
    ['declined', false],
  ] as const)('says a %s signup is awaiting review: %s', (name, expected) => {
    expect(isAwaitingReview(signups[name])).toBe(expected);
  });
});
