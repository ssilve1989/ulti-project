import { DocumentData } from 'firebase-admin/firestore';

export interface Settings extends DocumentData {
  reviewChannel: string;
  reviewerRole?: string;
  signupChannel?: string;
  spreadsheetId?: string;
}
