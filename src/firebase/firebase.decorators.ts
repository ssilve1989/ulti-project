import { Inject } from '@nestjs/common';
import { FIRESTORE } from './firebase.consts.js';

export const InjectFirestore = () => Inject(FIRESTORE);
