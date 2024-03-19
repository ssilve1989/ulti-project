import { Injectable } from '@nestjs/common';
import day from 'dayjs';
import {
  type CollectionReference,
  type DocumentData,
  Firestore,
  type Query,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import {
  CreateSignupDocumentProps,
  SignupDocument,
  SignupStatus,
} from '../models/signup.model.js';
import { SignupCompositeKeyProps as SignupCompositeKey } from '../models/signup.model.js';

@Injectable()
class SignupCollection {
  private readonly collection: CollectionReference<SignupDocument>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<SignupDocument>;
  }

  /**
   * Upserts a signup request into the database
   * @param signup
   */
  public async createSignup(
    signup: CreateSignupDocumentProps,
  ): Promise<SignupDocument> {
    const key = this.getKeyForSignup(signup);
    const document = this.collection.doc(key);
    const expiresAt = Timestamp.fromDate(day().add(28, 'days').toDate());
    const snapshot = await document.get();

    if (snapshot.exists) {
      await document.set(
        {
          ...signup,
          status: SignupStatus.PENDING,
          reviewedBy: null,
          expiresAt,
        },
        {
          merge: true,
        },
      );
    } else {
      await document.create({
        ...signup,
        expiresAt,
        status: SignupStatus.PENDING,
      });
    }

    const updatedSnapshot = await this.collection.doc(key).get();
    return updatedSnapshot.data()!;
  }

  public async findOne(
    query: Partial<SignupDocument>,
  ): Promise<SignupDocument> {
    const snapshot = await this.where(query).limit(1).get();

    if (snapshot.empty) {
      throw new DocumentNotFoundException('SignupDocument not found');
    }

    return snapshot.docs[0].data();
  }

  public async findAll(
    query: Partial<SignupDocument>,
  ): Promise<SignupDocument[]> {
    const snapshot = await this.where(query).get();
    return snapshot.docs.map((doc) => doc.data() as SignupDocument);
  }

  public async findByReviewId(reviewMessageId: string) {
    const snapshot = await this.where({ reviewMessageId }).limit(1).get();

    if (snapshot.empty) {
      throw new DocumentNotFoundException(
        `No signup found for review message id: ${reviewMessageId}`,
      );
    }

    return snapshot.docs[0].data();
  }

  /**
   * Updates the approval status of a signup. Does not modify the timestamp of the signup
   * @param status - new status for the signup
   * @param key - composite key for the signup
   * @param reviewedBy - discordId of the user that reviewed the signup
   * @returns
   */
  public updateSignupStatus(
    status: SignupStatus,
    {
      partyType,
      progPoint,
      ...key
    }: SignupCompositeKey & Pick<SignupDocument, 'progPoint' | 'partyType'>,
    reviewedBy: string,
  ) {
    return this.collection.doc(this.getKeyForSignup(key)).update({
      status,
      progPoint,
      reviewedBy,
      partyType,
    });
  }

  /**
   * Sets the discord message id of the message posted for review
   * @param signup
   * @param messageId
   * @returns
   */
  public setReviewMessageId(signup: SignupCompositeKey, messageId: string) {
    const key = this.getKeyForSignup(signup);

    return this.collection.doc(key).update({
      reviewMessageId: messageId,
    });
  }

  public async removeSignup(
    signup: SignupCompositeKey,
  ): Promise<Pick<SignupDocument, 'discordId'>> {
    const key = this.getKeyForSignup(signup);
    const doc = await this.findOne(signup);
    await this.collection.doc(key).delete();
    return { discordId: doc.discordId };
  }

  private getKeyForSignup({ discordId, encounter }: SignupCompositeKey) {
    return `${discordId.toLowerCase()}-${encounter}`;
  }

  /**
   * Returns a query for the given properties
   * @param props
   * @returns
   */
  private where(props: Partial<SignupDocument>) {
    let query: Query = this.collection;

    for (const [key, value] of Object.entries(props)) {
      if (!value) continue;
      query = query.where(key, '==', value);
    }

    return query as Query<SignupDocument, DocumentData>;
  }
}

export { SignupCollection };
