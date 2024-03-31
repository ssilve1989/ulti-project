import { DocumentData } from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.js';

export enum SeasonStatus {
  Open = 'OPEN',
  Closed = 'CLOSED',
}

export interface SettingsDocument extends DocumentData {
  progRoles?: {
    [key in keyof typeof Encounter]?: string;
  };

  reviewChannel?: string;
  reviewerRole?: string;
  seasonStatus?: SeasonStatus;
  signupChannel?: string;
  spreadsheetId?: string;
}
