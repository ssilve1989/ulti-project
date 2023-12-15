import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { Injectable } from '@nestjs/common';
import {
  Signup,
  SignupCompositeKeyProps,
  SignupRequest,
} from './signup.interfaces.js';
import { SignupStatus } from './signup.consts.js';

@Injectable()
class SignupRepository {
  private readonly collection: CollectionReference<Signup>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<Signup>;
  }

  /**
   * Upserts a signup request into the database. If the signup already exists, it will update the
   * fflogsLink, character, world, and availability fields. Otherwise, it will create a new signup
   * @param signup
   */
  public async createSignup(signup: SignupRequest): Promise<Signup> {
    const key = this.getKeyForSignup(signup);

    const document = this.collection.doc(key);
    const snapshot = await document.get();

    if (snapshot.exists) {
      await document.set(
        { ...signup, status: SignupStatus.PENDING, reviewedBy: null },
        {
          // only update these fields if the document already exists. This allows approvals that were made to remain intact
          mergeFields: [
            'fflogsLink',
            'character',
            'world',
            'availability',
            'status',
            'reviewedBy',
          ],
        },
      );
    } else {
      await document.create({ ...signup, status: SignupStatus.PENDING });
    }

    const updatedSnapshot = await this.collection.doc(key).get();
    return updatedSnapshot.data()!;
  }

  public async findByReviewId(messageId: string) {
    const snapshot = await this.collection
      .where('reviewMessageId', '==', messageId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error('No signup found for review message id: ' + messageId);
    }

    return snapshot.docs[0].data();
  }

  public updateSignupStatus(
    status: SignupStatus,
    key: SignupCompositeKeyProps,
    reviewedBy: string,
  ) {
    return this.collection.doc(this.getKeyForSignup(key)).update({
      status,
      reviewedBy,
    });
  }

  public setReviewMessageId(
    signup: SignupCompositeKeyProps,
    messageId: string,
  ) {
    const key = this.getKeyForSignup(signup);

    return this.collection.doc(key).update({
      reviewMessageId: messageId,
    });
  }

  private getKeyForSignup({ username, encounter }: SignupCompositeKeyProps) {
    // usernames are supposed to be unique right? The recent change discord
    // made to remove #discriminator from the username might make this wonky
    return `${username}-${encounter}`;
  }
}

export { SignupRepository };
