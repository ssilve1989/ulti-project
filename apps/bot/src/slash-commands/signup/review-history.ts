import type { ReviewHistoryEntry, SignupDocument } from '@ulti-project/shared';
import type { Timestamp } from 'firebase-admin/firestore';

export type ReviewDecisionEntry = Exclude<
  ReviewHistoryEntry,
  { type: 'trackingStarted' }
>;

type ReviewDecisionType = ReviewDecisionEntry['type'];

/**
 * Returns the entries to append for a review decision. The first append to a
 * document without history also records a `trackingStarted` snapshot of the
 * standing approval, so a future revert can tell "nothing to restore" apart
 * from "approved before tracking began".
 *
 * `signup` must be the document as read before the write, not the confirmed
 * document carrying the new prog point.
 */
export function withTrackingSeed(
  {
    reviewHistory,
    progPoint,
    partyStatus,
  }: Pick<SignupDocument, 'reviewHistory' | 'progPoint' | 'partyStatus'>,
  entry: ReviewDecisionEntry,
  at: Timestamp,
): ReviewHistoryEntry[] {
  if (reviewHistory !== undefined) {
    return [entry];
  }

  return [{ type: 'trackingStarted', progPoint, partyStatus, at }, entry];
}

export function latestDecision(
  history: ReviewHistoryEntry[] | undefined,
): ReviewDecisionEntry | undefined {
  return history?.findLast(isDecision);
}

export function latestEntryOfType<T extends ReviewDecisionType>(
  history: ReviewHistoryEntry[] | undefined,
  type: T,
): Extract<ReviewDecisionEntry, { type: T }> | undefined {
  return history?.findLast(
    (entry): entry is Extract<ReviewDecisionEntry, { type: T }> =>
      entry.type === type,
  );
}

function isDecision(entry: ReviewHistoryEntry): entry is ReviewDecisionEntry {
  return entry.type !== 'trackingStarted';
}
