import {
  PartyStatus,
  type ReviewHistoryEntry,
  type SignupDocument,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { partialMock } from '../../test-utils/mock-factory.js';
import {
  latestDecision,
  latestEntryOfType,
  type ReviewDecisionEntry,
  withTrackingSeed,
} from './review-history.js';

const at = Timestamp.fromMillis(1_000);

const approved: ReviewDecisionEntry = {
  type: 'approved',
  progPoint: 'P2',
  partyStatus: PartyStatus.ProgParty,
  actorId: 'reviewer-1',
  at,
  via: 'reaction',
};

const declined: ReviewDecisionEntry = {
  type: 'declined',
  actorId: 'reviewer-2',
  at,
  via: 'reaction',
};

const edited: ReviewDecisionEntry = {
  type: 'progPointEdited',
  progPoint: 'P4',
  partyStatus: PartyStatus.ClearParty,
  actorId: 'reviewer-3',
  at,
  via: 'edit',
};

const seed: ReviewHistoryEntry = { type: 'trackingStarted', at };

describe('withTrackingSeed', () => {
  it('prepends a seed snapshotting the standing approval when history is absent', () => {
    const signup = partialMock<SignupDocument>({
      progPoint: 'P1',
      partyStatus: PartyStatus.EarlyProgParty,
    });

    expect(withTrackingSeed(signup, approved, at)).toEqual([
      {
        type: 'trackingStarted',
        progPoint: 'P1',
        partyStatus: PartyStatus.EarlyProgParty,
        at,
      },
      approved,
    ]);
  });

  it('seeds without a prog point when there is no standing approval', () => {
    expect(
      withTrackingSeed(partialMock<SignupDocument>({}), declined, at),
    ).toEqual([
      {
        type: 'trackingStarted',
        progPoint: undefined,
        partyStatus: undefined,
        at,
      },
      declined,
    ]);
  });

  it('returns only the entry when history already exists', () => {
    const signup = partialMock<SignupDocument>({
      progPoint: 'P1',
      reviewHistory: [seed],
    });

    expect(withTrackingSeed(signup, approved, at)).toEqual([approved]);
  });
});

describe('latestDecision', () => {
  it('returns undefined for missing or empty history', () => {
    expect(latestDecision(undefined)).toBeUndefined();
    expect(latestDecision([])).toBeUndefined();
  });

  it('skips trackingStarted entries', () => {
    expect(latestDecision([seed])).toBeUndefined();
    expect(latestDecision([approved, seed])).toBe(approved);
  });

  it('returns the most recent decision', () => {
    expect(latestDecision([seed, approved, declined, edited])).toBe(edited);
  });
});

describe('latestEntryOfType', () => {
  it('returns the most recent entry of the requested type', () => {
    const laterApproval: ReviewDecisionEntry = {
      ...approved,
      actorId: 'reviewer-9',
    };

    expect(
      latestEntryOfType(
        [approved, declined, laterApproval, edited],
        'approved',
      ),
    ).toBe(laterApproval);
  });

  it('returns undefined when no entry of the type exists', () => {
    expect(latestEntryOfType([seed, approved], 'declined')).toBeUndefined();
    expect(latestEntryOfType(undefined, 'approved')).toBeUndefined();
  });
});
