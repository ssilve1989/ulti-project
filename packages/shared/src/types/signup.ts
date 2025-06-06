import { Encounter } from './encounters.js';

export enum SignupStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  UPDATE_PENDING = 'UPDATE_PENDING',
}

export enum PartyStatus {
  EarlyProgParty = 'Early Prog Party',
  ProgParty = 'Prog Party',
  ClearParty = 'Clear Party',
  Cleared = 'Cleared',
}

export type Role = 'Tank' | 'Healer' | 'DPS';

export type SchedulingStatus = 'unscheduled' | 'scheduled' | 'confirmed';

// Backend interface (matches Firebase document structure)
export interface SignupDocument {
  availability: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  notes?: string | null;
  proofOfProgLink?: string | null;
  role: string; // freeform field representing the character's job/role/class
  progPoint?: string; // the prog point specified by the coordinator upon review
  progPointRequested: string; // the prog point specified by the signup user
  partyStatus?: PartyStatus; // the party type we determined they should be
  /** @deprecated */
  partyType?: PartyStatus;
  reviewedBy?: string | null; // discordId of the user that reviewed this signup
  reviewMessageId?: string; // the message id of the review message posted to discord
  screenshot?: string | null; // discord uploaded screenshot link (expires in 2 weeks)
  username: string; // the friendly name of the user that signed up
  status: SignupStatus;
  world: string; // user character's home world
  expiresAt: Date | { seconds: number; nanoseconds: number }; // Firestore Timestamp
}

// Frontend interface (normalized for display)
export interface SignupDisplayData {
  id: string;
  character: string;
  world: string;
  encounter: Encounter;
  partyStatus: 'Early Prog Party' | 'Prog Party' | 'Clear Party' | 'Cleared';
  role: Role;
  job: string;
  progPoint: string;
  availability: string[];
  discordId: string;
  status: 'pending' | 'approved' | 'rejected';
  lastUpdated: Date;
  schedulingStatus?: SchedulingStatus;
  squad?: string | null;
}

// API interfaces
export interface SignupFilters {
  encounter?: string;
  partyType?: string;
  role?: string;
  search?: string;
}

export interface SignupsResponse {
  signups: SignupDisplayData[];
  total: number;
  encounters: Array<{
    id: string;
    name: string;
    shortName: string;
  }>;
}

// Creation types
export type CreateSignupDocumentProps = Omit<
  SignupDocument,
  'status' | 'expiresAt'
>;

export type SignupCompositeKeyProps = Pick<
  SignupDocument,
  'discordId' | 'encounter'
>;
