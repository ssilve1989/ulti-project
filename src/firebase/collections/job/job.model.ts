import type { DocumentData } from 'firebase-admin/firestore';

export interface JobDocument extends DocumentData {
  name: string;
  enabled: boolean;
}
