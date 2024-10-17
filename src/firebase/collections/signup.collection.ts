import { Injectable } from '@nestjs/common';
import day from 'dayjs';
import {
  type CollectionReference,
  type DocumentData,
  Firestore,
  type Query,
  Timestamp,
} from 'firebase-admin/firestore';
import { SentryTraced } from '../../observability/span.decorator.js';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import {
  type CreateSignupDocumentProps,
  type SignupCompositeKeyProps as SignupCompositeKey,
  type SignupDocument,
  SignupStatus,
} from '../models/signup.model.js';

@Injectable()
class SignupCollection {
  private readonly collection: CollectionReference<SignupDocument>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<SignupDocument>;
  }

  @SentryTraced()
  public static getKeyForSignup({ discordId, encounter }: SignupCompositeKey) {
    return `${discordId.toLowerCase()}-${encounter}`;
  }

  /**
   * Upserts a signup request into the database
   * @param signup
   */
  @SentryTraced()
  public async upsert(
    signup: CreateSignupDocumentProps,
  ): Promise<SignupDocument> {
    const key = SignupCollection.getKeyForSignup(signup);
    const document = this.collection.doc(key);
    const expiresAt = Timestamp.fromDate(day().add(28, 'days').toDate());
    const snapshot = await document.get();

    if (snapshot.exists) {
      // if there is already a signup, we move the status to be UPDATE_PENDING
      // to differentiate it from a new signup PENDING
      await document.update({
        ...signup,
        status: SignupStatus.UPDATE_PENDING,
        reviewedBy: null,
        expiresAt,
      });
    } else {
      await document.create({
        ...signup,
        expiresAt,
        status: SignupStatus.PENDING,
      });
    }

    const update = await this.collection.doc(key).get();
    return update.data()!;
  }

  @SentryTraced()
  public async findById(id: string): Promise<SignupDocument | undefined> {
    const snapshot = await this.collection.doc(id).get();
    return snapshot.data();
  }

  @SentryTraced()
  public async findOne(
    query: Partial<SignupDocument>,
  ): Promise<SignupDocument | undefined> {
    const snapshot = await this.where(query).limit(1).get();
    return snapshot.docs.at(0)?.data();
  }

  @SentryTraced()
  public async findOneOrFail(
    query: Partial<SignupDocument>,
  ): Promise<SignupDocument> {
    const signup = await this.findOne(query);

    if (!signup) {
      throw new DocumentNotFoundException(query);
    }

    return signup;
  }

  @SentryTraced()
  public async findAll(
    query: Partial<SignupDocument>,
  ): Promise<SignupDocument[]> {
    const snapshot = await this.where(query).get();
    return snapshot.docs.map((doc) => doc.data() as SignupDocument);
  }

  @SentryTraced()
  public async findByReviewId(reviewMessageId: string) {
    const snapshot = await this.where({ reviewMessageId }).limit(1).get();

    if (snapshot.empty) {
      throw new DocumentNotFoundException({ reviewMessageId });
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
  @SentryTraced()
  public updateSignupStatus(
    status: SignupStatus,
    {
      partyStatus,
      progPoint,
      ...key
    }: SignupCompositeKey & Pick<SignupDocument, 'progPoint' | 'partyStatus'>,
    reviewedBy: string,
  ) {
    return this.collection.doc(SignupCollection.getKeyForSignup(key)).update({
      status,
      progPoint,
      reviewedBy,
      partyStatus,
    });
  }

  /**
   * Sets the discord message id of the message posted for review
   * @param signup
   * @param messageId
   * @returns
   */
  @SentryTraced()
  public setReviewMessageId(signup: SignupCompositeKey, messageId: string) {
    const key = SignupCollection.getKeyForSignup(signup);

    return this.collection.doc(key).update({
      reviewMessageId: messageId,
    });
  }

  @SentryTraced()
  public async removeSignup({
    character,
    world,
    encounter,
  }: ExactType<SignupDocument, 'character' | 'encounter' | 'world'>) {
    const doc = await this.where({ character, encounter, world }).get();
    return Promise.all(doc.docs.map((doc) => doc.ref.delete()));
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
