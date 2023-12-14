import { DocumentData } from 'firebase-admin/firestore';

export interface Settings extends DocumentData {
  reviewerRole?: string;
  reviewChannel: string;
}
