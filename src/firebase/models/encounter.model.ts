import type { DocumentData } from 'firebase-admin/firestore';
import type { PartyStatus } from './signup.model.js';

export interface EncounterDocument extends DocumentData {
  name: string;
  description: string;
  active: boolean;
  progPartyThreshold?: string;
  clearPartyThreshold?: string;
}

export interface ProgPointDocument extends DocumentData {
  id: string; // Short name used for public presentation (Google Sheets, etc.)
  label: string; // Long name used for Discord presentation (signup messages, embeds, etc.)
  partyStatus: PartyStatus;
  order: number;
  active: boolean;
}
