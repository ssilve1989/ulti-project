import { registerAs } from '@nestjs/config';
import Joi from 'joi';

export const firestoreSchema = Joi.object({
  FIRESTORE_CLIENT_EMAIL: Joi.string().required(),
  FIRESTORE_PRIVATE_KEY: Joi.string().required(),
  FIRESTORE_PROJECT_ID: Joi.string().required(),
});

export const firestoreConfig = registerAs('firestore', () => ({
  projectId: process.env.FIRESTORE_PROJECT_ID,
  privateKey: process.env.FIRESTORE_PRIVATE_KEY,
  clientEmail: process.env.FIRESTORE_CLIENT_EMAIL,
}));
