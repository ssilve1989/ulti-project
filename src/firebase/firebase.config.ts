import { registerAs } from '@nestjs/config';
import Joi from 'joi';

export interface FirebaseConfig {
  FIRESTORE_DATABASE_ID?: string;
}

const schema = Joi.object({
  FIRESTORE_DATABASE_ID: Joi.string().optional(),
});

export const firebaseConfig = registerAs<FirebaseConfig>('firebase', () => {
  const res = schema.validate(process.env, { stripUnknown: true });
  if (res.error) throw res.error;
  return res.value;
});
