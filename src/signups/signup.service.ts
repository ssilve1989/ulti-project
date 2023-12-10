import { Injectable } from '@nestjs/common';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { Signup, SignupRequest } from './signup.interfaces.js';

@Injectable()
class SignupService {
  private readonly collection: CollectionReference<Signup>;
  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<Signup>;
  }

  public async upsertSignup(signup: SignupRequest) {
    const key = this.getKeyForSignup(signup);

    const document = this.collection.doc(key);
    const snapshot = await document.get();

    if (snapshot.exists) {
      return document.set(signup, {
        // only update these fields if the document already exists. This allows approvals that were made to remain intact
        mergeFields: ['fflogsLink', 'character', 'world', 'availability'],
      });
    }

    return document.create({ ...signup, approved: false });
  }

  private getKeyForSignup({ username, encounter }: SignupRequest) {
    // usernames are supposed to be unique right? The recent change discord
    // made to remove #discriminator from the username might make this wonky
    return `${username}-${encounter}`;
  }
}

export { SignupService };
