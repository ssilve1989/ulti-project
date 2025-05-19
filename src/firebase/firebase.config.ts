import { registerAs } from '@nestjs/config';
import { z } from 'zod/v4';

const schema = z.object({
  FIRESTORE_DATABASE_ID: z.string().optional(),
});

export type FirebaseConfig = z.infer<typeof schema>;

export const firebaseConfig = registerAs<FirebaseConfig>('firebase', () =>
  schema.parse(process.env),
);
