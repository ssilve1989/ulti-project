import { DocumentData } from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.js';

export interface Settings extends DocumentData {
  reviewChannel: string;
  reviewerRole?: string;
  signupChannel?: string;
  spreadsheetId?: string;
  progRoles: {
    [key in keyof typeof Encounter]?: string;
  };
}
