import { Injectable } from '@nestjs/common';
import { InjectFirestore } from '../../firebase/firebase.decorators.js';
import { Firestore } from 'firebase-admin/firestore';
import { Signup } from '../signup/signup.interfaces.js';

@Injectable()
class StatusService {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  /**
   * Get all signups for a given discordId
   * @param discordId
   * @returns
   */
  public getSignups(discordId: string): Promise<Signup[]> {
    return this.firestore
      .collection('signups')
      .where('discordId', '==', discordId)
      .get()
      .then((snapshot) => snapshot.docs.map((doc) => doc.data() as Signup));
  }
}

export { StatusService };
