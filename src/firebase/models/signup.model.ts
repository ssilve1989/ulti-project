import { Timestamp } from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.js';

export enum SignupStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  UPDATE_PENDING = 'UPDATE_PENDING',
}

export type SignupStatusValues = keyof { [K in SignupStatus]: any };

export enum PartyStatus {
  EarlyProgParty = 'Early Prog Party',
  ProgParty = 'Prog Party',
  ClearParty = 'Clear Party',
  Cleared = 'Cleared',
}

export interface SignupDocument {
  availability: string;
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
  /** @deprecated */
  partyType?: PartyStatus;
  // discordId of the user that reviewed this signup
  reviewedBy?: string | null;
  // the message id of the review message posted to discord
  reviewMessageId?: string;
  // discord uploaded screenshot link. These only last for 2 weeks on discord
  screenshot?: string | null;
  // the friendly name of the user that signed up
  username: string;
  status: SignupStatus;
  // user characters home world
  world: string;
  expiresAt: Timestamp;
}

export type CreateSignupDocumentProps = Omit<
  SignupDocument,
  'status' | 'expiresAt'
>;

export type SignupCompositeKeyProps = Pick<
  SignupDocument,
  'discordId' | 'encounter'
>;
