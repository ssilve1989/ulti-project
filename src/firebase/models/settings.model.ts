import type { DocumentData } from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.js';

export interface SettingsDocument extends DocumentData {
  helperRole?: string;
  modChannelId?: string;
  reviewChannel?: string;
  reviewerRole?: string;
  signupChannel?: string;
  spreadsheetId?: string;
  turboProgActive?: boolean;
  turboProgSpreadsheetId?: string;

  progRoles?: {
    [key in keyof typeof Encounter]?: string;
  };

  clearRoles?: {
    [key in keyof typeof Encounter]?: string;
  };
}
