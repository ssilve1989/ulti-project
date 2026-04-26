import { Timestamp } from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.js';

export enum SignupStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  UPDATE_PENDING = 'UPDATE_PENDING',
}

export type SignupStatusValues = keyof {
  [K in SignupStatus]: keyof (typeof SignupStatus)[K];
};

export enum PartyStatus {
  EarlyProgParty = 'Early Prog Party',
  ProgParty = 'Prog Party',
  ClearParty = 'Clear Party',
  Cleared = 'Cleared',
}

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

export interface PendingSignupDocument extends SignupDocumentBase {
  status: SignupStatus.PENDING | SignupStatus.UPDATE_PENDING;
  /** Only present for UPDATE_PENDING: prog point carried forward from the previous approval */
  progPoint?: string;
}

export interface ApprovedSignupDocument extends SignupDocumentBase {
  status: SignupStatus.APPROVED;
  /** discordId of the user that reviewed this signup */
  reviewedBy: string;
  /** the prog point confirmed by the coordinator upon review */
  progPoint?: string;
  /** the party type we determined they should be */
  partyStatus?: PartyStatus;
}

export interface DeclinedSignupDocument extends SignupDocumentBase {
  status: SignupStatus.DECLINED;
  /** discordId of the user that reviewed this signup */
  reviewedBy: string;
  /** reason provided by reviewer when declining a signup */
  declineReason?: string;
}

export type SignupDocument =
  | PendingSignupDocument
  | ApprovedSignupDocument
  | DeclinedSignupDocument;

export type CreateSignupDocumentProps = Omit<
  SignupDocumentBase,
  'expiresAt' | 'availability'
>;

export type SignupCompositeKeyProps = Pick<
  SignupDocumentBase,
  'discordId' | 'encounter'
>;
