import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import day from 'dayjs';
import {
  type CollectionReference,
  type DocumentData,
  Firestore,
  type Query,
  type QuerySnapshot,
  Timestamp,
} from 'firebase-admin/firestore';
import { match } from 'ts-pattern';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import {
  type CreateSignupDocumentProps,
  type SignupCompositeKeyProps as SignupCompositeKey,
  type SignupDocument,
  SignupStatus,
} from '../models/signup.model.js';

@Injectable()
class SignupCollection implements OnModuleInit {
  private readonly collection: CollectionReference<SignupDocument>;
  private readonly logger = new Logger(SignupCollection.name);
  // we are aware this is unbounded but its fine generally speaking for the size of our data and limits
  // of our container this runs in
  private readonly cache: Map<string, SignupDocument> = new Map();

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = this.firestore.collection(
      'signups',
    ) as CollectionReference<SignupDocument>;
  }

  onModuleInit() {
    // load snapshot into cache
    this.collection.get().then((snapshot) => {
      this.seedCache(snapshot);
    });

    this.collection.onSnapshot((snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        match(change.type)
          .with('added', () => this.addToCache(change.doc.data()))
          .with('modified', () => this.updateCache(change.doc.data()))
          .with('removed', () => this.removeFromCache(change.doc.data()))
          .exhaustive();
      }
    });
  }

  private seedCache(snapshot: QuerySnapshot<SignupDocument, DocumentData>) {
    for (const doc of snapshot.docs) {
      this.addToCache(doc.data());
    }
    this.logger.log(`Seeded cache with ${snapshot.docs.length} signups`);
  }

  private addToCache(signup: SignupDocument): any {
    this.cache.set(SignupCollection.getKeyForSignup(signup), signup);
    this.logger.log(`Added signup for user ${signup.discordId} to cache`);
  }

  private updateCache(signup: SignupDocument): any {
    this.cache.set(SignupCollection.getKeyForSignup(signup), signup);
    this.logger.log(`Updated signup for user ${signup.discordId} in cache`);
  }

  private removeFromCache(signup: SignupDocument): any {
    this.cache.delete(SignupCollection.getKeyForSignup(signup));
    this.logger.log(`Removed signup for user ${signup.discordId} from cache`);
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
