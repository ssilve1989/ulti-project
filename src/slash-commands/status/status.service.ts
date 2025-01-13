import { Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../../firebase/firebase.decorators.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import { SentryTraced } from '../../sentry/sentry-traced.decorator.js';

@Injectable()
class StatusService {
  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  /**
   * Get all signups for a given discordId
   * @param discordId
   * @returns
   */
  @SentryTraced()
  public async getSignups(discordId: string): Promise<SignupDocument[]> {
    const snapshot = await this.firestore
      .collection('signups')
      .where('discordId', '==', discordId)
      .get();
    return snapshot.docs.map((doc) => doc.data() as SignupDocument);
  }
}

export { StatusService };
