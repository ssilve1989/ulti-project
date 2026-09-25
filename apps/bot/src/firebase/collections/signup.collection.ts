import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type CreateSignupDocumentProps,
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
   * @returns the written signup, and the document as it was before the write
   * (undefined if it was newly created). The written status is only ever
   * PENDING or UPDATE_PENDING, so `previous` is how callers tell whether the
   * signup had already been reviewed.
   */
  @SentryTraced()
  public async upsert(
    props: CreateSignupDocumentProps,
  ): Promise<{ signup: SignupDocument; previous: SignupDocument | undefined }> {
    const key = SignupCollection.getKeyForSignup(props);
    const document = this.collection.doc(key);
    const expiresAt = Timestamp.fromMillis(
      Temporal.Now.zonedDateTimeISO().add({ days: 28 }).epochMilliseconds,
    );
    const snapshot = await document.get();
    const existing = snapshot.data();

    if (existing) {
      const signupData = {
        ...existing,
        ...props,
        // if there is already a signup and it is still PENDING we do nothing, otherwise we move it to UPDATE_PENDING
        status:
          existing.status === SignupStatus.PENDING
            ? SignupStatus.PENDING
            : SignupStatus.UPDATE_PENDING,
        // reset the reviewedBy field because it now has to be reviewed again
        reviewedBy: null,
        declineReason: FieldValue.delete(),
        expiresAt,
      };
      await document.update(signupData);
      return {
        signup: { ...signupData, declineReason: undefined },
        previous: existing,
      };
    }

    const signupData = {
      ...props,
      expiresAt,
      status: SignupStatus.PENDING,
    };

    await document.create(signupData);
    return { signup: signupData, previous: undefined };
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
      ...(status !== SignupStatus.DECLINED && {
        declineReason: FieldValue.delete(),
      }),
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
  /**
   * Atomically records a decline reason, but only if the signup is still in the
   * same decline round. Guards against a decline reason being collected for a
   * previous review round landing on a signup that has since been re-submitted
   * (UPDATE_PENDING) or reviewed again (new reviewMessageId/reviewedBy).
   */
  public updateDeclineReasonIfActive(
    signup: SignupCompositeKey,
    declineReason: string,
    expectedReviewMessageId: string | undefined,
    expectedReviewedBy: string,
  ): Promise<boolean> {
    const ref = this.collection.doc(SignupCollection.getKeyForSignup(signup));

    return this.firestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.data();

      if (
        !current ||
        current.status !== SignupStatus.DECLINED ||
        current.reviewMessageId !== expectedReviewMessageId ||
        current.reviewedBy !== expectedReviewedBy
      ) {
        return false;
      }

      tx.update(ref, { declineReason });
      return true;
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
