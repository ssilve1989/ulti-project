import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import day from 'dayjs';
import {
  type CollectionReference,
  type DocumentData,
  Firestore,
  type Query,
  Timestamp,
  type UpdateData,
} from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import {
  type ApprovedSignupDocument,
  type CreateSignupDocumentProps,
  type DeclinedSignupDocument,
  type PendingSignupDocument,
  type SignupCompositeKeyProps as SignupCompositeKey,
  type SignupDocument,
  SignupStatus,
} from '../models/signup.model.js';

// Internal type for Firestore field-based queries — not exported.
// All fields optional; status-specific fields are included so callers can filter by them.
type SignupFilter = Partial<
  Omit<PendingSignupDocument, 'status'> &
    Omit<ApprovedSignupDocument, 'status'> &
    Omit<DeclinedSignupDocument, 'status'> & { status: SignupStatus }
>;

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
    props: CreateSignupDocumentProps,
  ): Promise<SignupDocument> {
    const key = SignupCollection.getKeyForSignup(props);
    const document = this.collection.doc(key);
    const expiresAt = Timestamp.fromDate(day().add(28, 'days').toDate());
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
        expiresAt,
      } as unknown as SignupDocument;
      await document.update(signupData as unknown as UpdateData<DocumentData>);
      return signupData;
    }

    const signupData = {
      ...props,
      expiresAt,
      status: SignupStatus.PENDING,
    } satisfies SignupDocument;

    await document.create(signupData);
    return signupData;
  }

  @SentryTraced()
  public async findById(id: string): Promise<SignupDocument | undefined> {
    const snapshot = await this.collection.doc(id).get();
    return snapshot.data();
  }

  @SentryTraced()
  public async findOne(
    query: SignupFilter,
  ): Promise<SignupDocument | undefined> {
    const snapshot = await this.where(query).limit(1).get();
    return snapshot.docs.at(0)?.data();
  }

  @SentryTraced()
  public async findOneOrFail(query: SignupFilter): Promise<SignupDocument> {
    const signup = await this.findOne(query);

    if (!signup) {
      throw new DocumentNotFoundException(query);
    }

    return signup;
  }

  @SentryTraced()
  public async findAll(query: SignupFilter): Promise<SignupDocument[]> {
    const snapshot = await this.where(query).get();
    return snapshot.docs.map((doc) => doc.data() as SignupDocument);
  }

  @SentryTraced()
  public async findByStatusIn(
    statuses: SignupStatus[],
  ): Promise<SignupDocument[]> {
    const snapshot = await this.collection
      .where('status', 'in', statuses)
      .get();
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
   * Records coordinator approval: sets status to APPROVED and captures
   * the prog point and party type determined during review.
   */
  @SentryTraced()
  public approveSignup(
    key: SignupCompositeKey,
    {
      progPoint,
      partyStatus,
    }: Pick<ApprovedSignupDocument, 'progPoint' | 'partyStatus'>,
    reviewedBy: string,
  ) {
    return this.collection.doc(SignupCollection.getKeyForSignup(key)).update({
      status: SignupStatus.APPROVED,
      progPoint,
      reviewedBy,
      partyStatus,
    });
  }

  /**
   * Records coordinator decline: sets status to DECLINED.
   * The decline reason is persisted separately via updateDeclineReason
   * because it is collected asynchronously.
   */
  @SentryTraced()
  public declineSignup(key: SignupCompositeKey, reviewedBy: string) {
    return this.collection.doc(SignupCollection.getKeyForSignup(key)).update({
      status: SignupStatus.DECLINED,
      reviewedBy,
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
  private where(props: SignupFilter) {
    let query: Query = this.collection;

    for (const [key, value] of Object.entries(props)) {
      if (!value) continue;
      query = query.where(key, '==', value);
    }

    return query as Query<SignupDocument, DocumentData>;
  }
}

export { SignupCollection };
