import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { Encounter } from '../../encounters/encounters.consts.js';
import {
  type ApprovedSignupDocument,
  type DeclinedSignupDocument,
  PartyStatus,
  type PendingSignupDocument,
  SignupStatus,
} from './signup.model.js';

const expiresAt = Timestamp.now();

describe('signup model types', () => {
  it('allows approval-only fields on approved signups', () => {
    const approved: ApprovedSignupDocument = {
      character: 'Alpha',
      discordId: '123',
      encounter: Encounter.TOP,
      expiresAt,
      progPointRequested: 'P6 Enrage',
      reviewedBy: 'reviewer-id',
      reviewMessageId: 'message-id',
      role: 'WAR',
      status: SignupStatus.APPROVED,
      username: 'AlphaUser',
      world: 'Gilgamesh',
      partyStatus: PartyStatus.ProgParty,
      progPoint: 'P6 Enrage',
    };

    expect(approved.reviewedBy).toBe('reviewer-id');
  });

  it('rejects progPoint on pending signups and partyStatus on declined signups at typecheck time', () => {
    const pending: PendingSignupDocument = {
      character: 'Beta',
      discordId: '456',
      encounter: Encounter.TOP,
      expiresAt,
      progPointRequested: 'P5',
      role: 'WHM',
      status: SignupStatus.PENDING,
      username: 'BetaUser',
      world: 'Cactuar',
    };

    const pendingWithProgPoint: PendingSignupDocument = {
      ...pending,
      // Compile-time guard only: enforced by `pnpm typecheck`, which is the required verification gate for this task.
      // @ts-expect-error pending signups cannot carry progPoint
      progPoint: 'P5',
    };

    const declinedWithPartyStatus: DeclinedSignupDocument = {
      character: 'Gamma',
      discordId: '789',
      encounter: Encounter.TOP,
      expiresAt,
      progPointRequested: 'P7',
      reviewedBy: 'reviewer-id',
      role: 'SGE',
      status: SignupStatus.DECLINED,
      username: 'GammaUser',
      world: 'Leviathan',
      // Compile-time guard only: enforced by `pnpm typecheck`, which is the required verification gate for this task.
      // @ts-expect-error declined signups cannot carry partyStatus
      partyStatus: PartyStatus.ClearParty,
    };

    void pendingWithProgPoint;
    void declinedWithPartyStatus;
  });
});
