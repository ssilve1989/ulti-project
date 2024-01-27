import { CollectionReference, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { Injectable } from '@nestjs/common';
import { Signup, SignupCompositeKeyProps } from './signup.interfaces.js';
import { SignupStatus } from './signup.consts.js';
import { SignupRequestDto } from './dto/signup-request.dto.js';

@Injectable()
class SignupRepository {
  private readonly collection: CollectionReference<Signup>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<Signup>;
  }

  /**
   * Upserts a signup request into the database
   * @param signup
   */
  public async createSignup({ ...signup }: SignupRequestDto): Promise<Signup> {
    const key = this.getKeyForSignup(signup);

    const document = this.collection.doc(key);
    const snapshot = await document.get();

    if (snapshot.exists) {
      await document.set(
        {
          ...signup,
          status: SignupStatus.PENDING,
          reviewedBy: null,
        },
        {
          merge: true,
        },
      );
    } else {
      await document.create({
        ...signup,
        status: SignupStatus.PENDING,
      });
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

  private getKeyForSignup({
    character,
    world,
    encounter,
  }: SignupCompositeKeyProps) {
    return `${character.toLowerCase()}-${world.toLowerCase()}-${encounter}`;
  }
}

export { SignupRepository };
