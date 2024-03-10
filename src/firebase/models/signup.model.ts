import { Encounter } from '../../encounters/encounters.consts.js';

export enum SignupStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
}

export enum PartyType {
  PROG_PARTY = 'Prog Party',
  CLEAR_PARTY = 'Clear Party',
}

export interface SignupDocument {
  availability: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  fflogsLink?: string | null;
  // freeform field representing the characters job/role/class
  role: string;
  progPoint?: string;
  partyType?: PartyType;
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
}

export type CreateSignupDocumentProps = Omit<SignupDocument, 'status'>;
export type SignupCompositeKeyProps = Pick<
  SignupDocument,
  'discordId' | 'encounter'
>;
