import { Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { SignupDocument } from '../firebase/models/signup.model.js';
import { SentryTraced } from '../observability/span.decorator.js';

@Injectable()
class StatusService {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  /**
   * Get all signups for a given discordId
   * @param discordId
   * @returns
   */
  @SentryTraced()
  public getSignups(discordId: string): Promise<SignupDocument[]> {
    return this.firestore
      .collection('signups')
      .where('discordId', '==', discordId)
      .get()
      .then((snapshot) =>
        snapshot.docs.map((doc) => doc.data() as SignupDocument),
      );
  }
}

export { StatusService };
