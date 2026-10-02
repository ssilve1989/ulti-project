import { Timestamp } from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.ts';

export const SignupStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  UPDATE_PENDING: 'UPDATE_PENDING',
} as const;

export type SignupStatus = (typeof SignupStatus)[keyof typeof SignupStatus];

export type SignupStatusValues = keyof typeof SignupStatus;

export const PartyStatus = {
  EarlyProgParty: 'Early Prog Party',
  ProgParty: 'Prog Party',
  ClearParty: 'Clear Party',
  Cleared: 'Cleared',
} as const;

export type PartyStatus = (typeof PartyStatus)[keyof typeof PartyStatus];

interface SignupDocumentBase {
  /** Preserved for potential future use - no longer used in presentation layer */
  availability?: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  notes?: string | null;
  proofOfProgLink?: string | null;
  /** freeform field representing the character's job/role/class */
  role: string;
  /** The prog point specified by the signup user */
  progPointRequested: string;
  /** the message id of the review message posted to discord */
  reviewMessageId?: string;
  /** discord uploaded screenshot link. These only last for 2 weeks on discord */
  screenshot?: string | null;
  /** the friendly name of the user that signed up */
  username: string;
  /** user character's home world */
  world: string;
  expiresAt: Timestamp;
}

/** Awaiting its first review. Nothing has been decided, so no review fields exist yet. */
export interface PendingSignupDocument extends SignupDocumentBase {
  declineReason?: never;
  partyStatus?: never;
  progPoint?: never;
  /** reset to null when a signup is resubmitted, because it has to be reviewed again */
  reviewedBy?: null;
  status: typeof SignupStatus.PENDING;
}

/**
 * A reviewed signup that has since been resubmitted. It is still on the
 * spreadsheet and keeps its roles, so it carries what the review decided until
 * the update is reviewed.
 */
export interface UpdatePendingSignupDocument extends SignupDocumentBase {
  declineReason?: never;
  /** the party type decided by the review being updated */
  partyStatus?: PartyStatus;
  /** the prog point confirmed by the review being updated */
  progPoint?: string;
  reviewedBy?: null;
  status: typeof SignupStatus.UPDATE_PENDING;
}

export interface ApprovedSignupDocument extends SignupDocumentBase {
  declineReason?: never;
  status: typeof SignupStatus.APPROVED;
  /** discordId of the user that reviewed this signup */
  reviewedBy: string;
  /** the prog point confirmed by the coordinator upon review */
  progPoint?: string;
  /** the party type we determined they should be */
  partyStatus?: PartyStatus;
}

export interface DeclinedSignupDocument extends SignupDocumentBase {
  status: typeof SignupStatus.DECLINED;
  /** discordId of the user that reviewed this signup */
  reviewedBy: string;
  /** reason provided by reviewer when declining a signup */
  declineReason?: string;
  /** declining a resubmitted signup leaves what its earlier review decided */
  partyStatus?: PartyStatus;
  progPoint?: string;
}

/** A signup a reviewer has yet to decide on */
export type AwaitingReviewSignupDocument =
  | PendingSignupDocument
  | UpdatePendingSignupDocument;

export type SignupDocument =
  | AwaitingReviewSignupDocument
  | ApprovedSignupDocument
  | DeclinedSignupDocument;

export function isAwaitingReview(
  signup: SignupDocument,
): signup is AwaitingReviewSignupDocument {
  return (
    signup.status === SignupStatus.PENDING ||
    signup.status === SignupStatus.UPDATE_PENDING
  );
}

export type CreateSignupDocumentProps = Omit<
  SignupDocumentBase,
  'expiresAt' | 'availability'
>;

export type SignupCompositeKeyProps = Pick<
  SignupDocumentBase,
  'discordId' | 'encounter'
>;
