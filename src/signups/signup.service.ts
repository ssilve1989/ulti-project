import { Injectable } from '@nestjs/common';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { Firestore } from 'firebase-admin/firestore';
import { Signup } from './signup.interfaces.js';

@Injectable()
class SignupService {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  public upsertSignup(signup: Signup) {
    const key = this.getKeyForSignup(signup);

    return this.firestore
      .collection('signups')
      .doc(key)
      .set(signup, { merge: true });
  }

  private getKeyForSignup({ username, encounter }: Signup) {
    // usernames are supposed to be unique right? The recent change discord
    // made to remove #discriminator from the username might make this wonky
    return `${username}-${encounter}`;
  }
}

export { SignupService };
