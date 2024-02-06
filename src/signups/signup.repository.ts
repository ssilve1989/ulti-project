import { Injectable } from '@nestjs/common';
import {
  CollectionReference,
  Firestore,
  Query,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase/firebase.decorators.js';
import { SignupRequestDto } from './dto/signup-request.dto.js';
import { SignupStatus } from './signup.consts.js';
import { DocumentNotFoundException } from './signup.exceptions.js';
import {
  Signup,
  SignupCompositeKeyProps as SignupCompositeKey,
} from './signup.interfaces.js';

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

  public async findOne(query: Partial<Signup>): Promise<Signup> {
    const snapshot = await this.where(query).limit(1).get();

    if (snapshot.empty) {
      throw new DocumentNotFoundException('Signup not found');
    }

    return snapshot.docs[0].data();
  }

  public async findByReviewId(reviewMessageId: string) {
    const snapshot = await this.where({ reviewMessageId }).limit(1).get();

    if (snapshot.empty) {
      throw new DocumentNotFoundException(
        'No signup found for review message id: ' + reviewMessageId,
      );
    }

    return snapshot.docs[0].data();
  }

  public updateSignupStatus(
    status: SignupStatus,
    key: SignupCompositeKey,
    reviewedBy: string,
  ) {
    return this.collection.doc(this.getKeyForSignup(key)).update({
      status,
      reviewedBy,
    });
  }

  public setReviewMessageId(signup: SignupCompositeKey, messageId: string) {
    const key = this.getKeyForSignup(signup);

    return this.collection.doc(key).update({
      reviewMessageId: messageId,
    });
  }

  public removeSignup(signup: SignupCompositeKey) {
    const key = this.getKeyForSignup(signup);

    return this.collection.doc(key).delete();
  }

  private getKeyForSignup({ character, world, encounter }: SignupCompositeKey) {
    return `${character.toLowerCase()}-${world.toLowerCase()}-${encounter}`;
  }

  /**
   * Returns a query for the given properties
   * @param props
   * @returns
   */
  private where(props: Partial<Signup>) {
    let query: Query = this.collection;

    for (const [key, value] of Object.entries(props)) {
      query = query.where(key, '==', value);
    }

    return query as Query<Signup, FirebaseFirestore.DocumentData>;
  }
}

export { SignupRepository };
