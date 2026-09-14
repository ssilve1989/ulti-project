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

export type ReviewSource = 'reaction' | 'edit';

export type ReviewHistoryEntry =
  // Snapshot of the standing approval when history tracking began for this
  // document. No progPoint means there was no standing approval.
  | {
      type: 'trackingStarted';
      progPoint?: string;
      partyStatus?: PartyStatus;
      at: Timestamp;
    }
  // Starts a new approval decision.
  | {
      type: 'approved';
      progPoint: string;
      partyStatus: PartyStatus;
      actorId: string;
      at: Timestamp;
      via: ReviewSource;
    }
  // Amends the prog point of the current approval decision.
  | {
      type: 'progPointEdited';
      progPoint: string;
      partyStatus: PartyStatus;
      actorId: string;
      at: Timestamp;
      via: 'edit';
    }
  // A decline. Does not change the standing approved prog point.
  | {
      type: 'declined';
      actorId: string;
      at: Timestamp;
      via: ReviewSource;
    };

// TODO: Some fields here _will_ be defined depending on the value of `status`. So we should improve the types to reflect this.
export interface SignupDocument {
  // Preserved for potential future use - no longer used in presentation layer
  availability?: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  notes?: string | null;
  proofOfProgLink?: string | null;
  // freeform field representing the characters job/role/class
  role: string;
  // the prog point specified by the coodinator upon review
  progPoint?: string;
  // The prog point specified by the signup user
  progPointRequested: string;
  // the party type we determined they should be
  partyStatus?: PartyStatus;
  // discordId of the user that reviewed this signup
  reviewedBy?: string | null;
  // the message id of the review message posted to discord
  reviewMessageId?: string;
  // the message id of the latest public "Signup Approved" announcement
  approvalMessageId?: string;
  // append-only record of review decisions and edits (Discord ids)
  reviewHistory?: ReviewHistoryEntry[];
  // discord uploaded screenshot link. These only last for 2 weeks on discord
  screenshot?: string | null;
  // the friendly name of the user that signed up
  username: string;
  status: SignupStatus;
  // user characters home world
  world: string;
  // reason provided by reviewer when declining a signup
  declineReason?: string;
  expiresAt: Timestamp;
}

export type CreateSignupDocumentProps = Omit<
  SignupDocument,
  | 'status'
  | 'expiresAt'
  | 'declineReason'
  | 'availability'
  | 'approvalMessageId'
  | 'reviewHistory'
>;

export type SignupCompositeKeyProps = Pick<
  SignupDocument,
  'discordId' | 'encounter'
>;
