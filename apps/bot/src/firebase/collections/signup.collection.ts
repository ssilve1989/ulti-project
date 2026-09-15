import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CreateSignupDocumentProps,
  type PartyStatus,
  type ReviewHistoryEntry,
  type SignupCompositeKeyProps as SignupCompositeKey,
  type SignupDocument,
  SignupStatus,
  typedCollection,
} from '@ulti-project/shared';
import {
  type CollectionReference,
  type DocumentData,
  FieldValue,
  Firestore,
  type Query,
  Timestamp,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';

// gRPC status Firestore reports when an update's precondition does not hold
const FIRESTORE_FAILED_PRECONDITION = 9;
// gRPC status Firestore reports when a document is not found
const FIRESTORE_NOT_FOUND = 5;

function isEditConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === FIRESTORE_FAILED_PRECONDITION ||
      error.code === FIRESTORE_NOT_FOUND)
  );
}

@Injectable()
class SignupCollection {
  private readonly collection: CollectionReference<SignupDocument>;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {
    this.collection = typedCollection<SignupDocument>(
      this.firestore,
      'signups',
    );
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
  public upsert(props: CreateSignupDocumentProps): Promise<SignupDocument> {
    const key = SignupCollection.getKeyForSignup(props);
    const document = this.collection.doc(key);
    const expiresAt = Timestamp.fromMillis(
      Temporal.Now.zonedDateTimeISO().add({ days: 28 }).epochMilliseconds,
    );

    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const existing = snapshot.data();

      if (existing) {
        const payload = {
          ...props,
          // if there is already a signup and it is still PENDING we do nothing, otherwise we move it to UPDATE_PENDING
          status:
            existing.status === SignupStatus.PENDING
              ? SignupStatus.PENDING
              : SignupStatus.UPDATE_PENDING,
          // reset the reviewedBy field because it now has to be reviewed again
          reviewedBy: null,
          expiresAt,
        };
        transaction.update(document, payload);
        return { ...existing, ...payload };
      }

      const signupData = {
        ...props,
        expiresAt,
        status: SignupStatus.PENDING,
      };

      transaction.create(document, signupData);
      return signupData;
    });
  }

  @SentryTraced()
  public async findById(id: string): Promise<SignupDocument | undefined> {
    const snapshot = await this.collection.doc(id).get();
    return snapshot.data();
  }

  /**
   * Reads a signup together with its last update time, for writes that must
   * not overwrite a change made after the read.
   */
  @SentryTraced()
  public async findByKeyWithVersion(
    key: SignupCompositeKey,
  ): Promise<{ signup: SignupDocument; updateTime: Timestamp } | undefined> {
    const snapshot = await this.collection
      .doc(SignupCollection.getKeyForSignup(key))
      .get();
    const signup = snapshot.data();

    if (!signup || !snapshot.updateTime) {
      return undefined;
    }

    return { signup, updateTime: snapshot.updateTime };
  }

  /**
   * Applies a reviewer's edit as an approval. Rejected with `conflict` when
   * the document changed after `updateTime` (re-submission or another edit).
   */
  @SentryTraced()
  public async applyEdit(
    key: SignupCompositeKey,
    {
      progPoint,
      partyStatus,
      historyEntries,
    }: {
      progPoint: string;
      partyStatus: PartyStatus;
      historyEntries: ReviewHistoryEntry[];
    },
    updateTime: Timestamp,
  ): Promise<{ type: 'written' } | { type: 'conflict' }> {
    try {
      await this.collection.doc(SignupCollection.getKeyForSignup(key)).update(
        {
          status: SignupStatus.APPROVED,
          progPoint,
          partyStatus,
          reviewHistory: FieldValue.arrayUnion(...historyEntries),
        },
        { lastUpdateTime: updateTime },
      );
      return { type: 'written' };
    } catch (error) {
      if (isEditConflict(error)) {
        return { type: 'conflict' };
      }
      throw error;
    }
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
    return snapshot.docs.map((doc) => doc.data());
  }

  @SentryTraced()
  public async findByStatusIn(
    statuses: SignupStatus[],
  ): Promise<SignupDocument[]> {
    const snapshot = await this.collection
      .where('status', 'in', statuses)
      .get();
    return snapshot.docs.map((doc) => doc.data());
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
   * Updates the approval status of a signup and appends to its review
   * history. Does not modify the timestamp of the signup
   * @param status - new status for the signup
   * @param key - composite key for the signup
   * @param reviewedBy - username of the user that reviewed the signup
   * @param historyEntries - review history entries to append
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
    historyEntries: ReviewHistoryEntry[],
  ) {
    return this.collection.doc(SignupCollection.getKeyForSignup(key)).update({
      status,
      progPoint,
      reviewedBy,
      partyStatus,
      reviewHistory: FieldValue.arrayUnion(...historyEntries),
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

  /**
   * Sets the discord message id of the public "Signup Approved" announcement
   * @param signup
   * @param messageId
   * @returns
   */
  @SentryTraced()
  public setApprovalMessageId(signup: SignupCompositeKey, messageId: string) {
    const key = SignupCollection.getKeyForSignup(signup);

    return this.collection.doc(key).update({
      approvalMessageId: messageId,
    });
  }

  @SentryTraced()
  public updateDeclineReason(
    signup: SignupCompositeKey,
    declineReason: string,
  ) {
    const key = SignupCollection.getKeyForSignup(signup);

    return this.collection.doc(key).update({
      declineReason,
    });
  }

  @SentryTraced()
  public async removeSignup<T>({
    character,
    world,
    encounter,
  }: Exact<T, Pick<SignupDocument, 'character' | 'encounter' | 'world'>>) {
    const snapshot = await this.where({ character, encounter, world }).get();
    return Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }

  /**
   * Returns a query for the given properties
   * @param props
   * @returns
   */
  private where(props: Partial<SignupDocument>) {
    let query: Query<SignupDocument, DocumentData> = this.collection;

    for (const [key, value] of Object.entries(props)) {
      if (!value) continue;
      query = query.where(key, '==', value);
    }

    return query;
  }
}

export { SignupCollection };
