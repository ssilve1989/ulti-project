import { z } from 'zod';

const firebaseSchema = z.object({
  FIRESTORE_DATABASE_ID: z.string().optional(),
});

export const firebaseConfig = firebaseSchema.parse(process.env);
export type FirebaseConfig = typeof firebaseConfig;
