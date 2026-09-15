import {
  Encounter,
  PartyStatus,
  type ReviewHistoryEntry,
} from '@ulti-project/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { storeApprovalMessageId } from './approval-announcement.js';

describe('storeApprovalMessageId', () => {
  const currentApprovalAt = Timestamp.fromMillis(2_000);
  const reviewHistory: ReviewHistoryEntry[] = [
    {
      type: 'approved',
      progPoint: 'P1',
      partyStatus: PartyStatus.EarlyProgParty,
      actorId: 'reviewer-0',
      at: Timestamp.fromMillis(1_000),
      via: 'reaction',
    },
    {
      type: 'approved',
      progPoint: 'P2',
      partyStatus: PartyStatus.ProgParty,
      actorId: 'reviewer-1',
      at: currentApprovalAt,
      via: 'edit',
    },
    {
      type: 'progPointEdited',
      progPoint: 'P3',
      partyStatus: PartyStatus.ProgParty,
      actorId: 'editor-1',
      at: Timestamp.fromMillis(3_000),
      via: 'edit',
    },
  ];
  const signup = {
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    reviewHistory,
  };

  let setApprovalMessageId: Mock<SignupCollection['setApprovalMessageId']>;
  let log: Mock<(message: string) => void>;
  let warn: Mock<(message: string) => void>;

  beforeEach(() => {
    setApprovalMessageId = vi
      .fn<SignupCollection['setApprovalMessageId']>()
      .mockResolvedValue({ type: 'written' });
    log = vi.fn<(message: string) => void>();
    warn = vi.fn<(message: string) => void>();
  });

  const store = (target: Parameters<typeof storeApprovalMessageId>[2]) =>
    storeApprovalMessageId(
      { setApprovalMessageId },
      { log, warn },
      target,
      'announcement-1',
    );

  it("stores the id against the latest approved entry's timestamp", async () => {
    await expect(store(signup)).resolves.toBeUndefined();

    expect(setApprovalMessageId).toHaveBeenCalledWith(
      signup,
      'announcement-1',
      currentApprovalAt,
    );
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs without failing when a newer approval superseded the announcement', async () => {
    setApprovalMessageId.mockResolvedValue({ type: 'stale' });

    await expect(store(signup)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      'A newer approval of signup applicant-1-DSR superseded announcement announcement-1, its id was not stored',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and stores nothing when the history has no approved entry', async () => {
    await expect(
      store({
        ...signup,
        reviewHistory: [
          { type: 'trackingStarted', at: Timestamp.fromMillis(1_000) },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(setApprovalMessageId).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Signup applicant-1-DSR has no approval decision for announcement announcement-1, its id was not stored',
    );
    expect(log).not.toHaveBeenCalled();
  });
});
