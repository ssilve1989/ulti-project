import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import day from 'dayjs';
import {
  type CollectionReference,
  type DocumentData,
  FieldValue,
  Firestore,
  type Query,
  Timestamp,
  type UpdateData,
} from 'firebase-admin/firestore';
import { Encounter } from '../../encounters/encounters.consts.js';
import { InjectFirestore } from '../firebase.decorators.js';
import { DocumentNotFoundException } from '../firebase.exceptions.js';
import {
  type ApprovedSignupDocument,
  type CreateSignupDocumentProps,
  PartyStatus,
  type PendingSignupDocument,
  type SignupCompositeKeyProps as SignupCompositeKey,
  type SignupDocument,
  SignupStatus,
} from '../models/signup.model.js';

type SignupFilter = Partial<{
  availability: string;
  character: string;
  declineReason: string;
  discordId: string;
  encounter: Encounter;
  expiresAt: Timestamp;
  notes: string | null;
  partyStatus: PartyStatus;
  progPoint: string;
  progPointRequested: string;
  reviewMessageId: string;
  reviewedBy: string;
  role: string;
  screenshot: string | null;
  status: SignupStatus;
  username: string;
  world: string;
}>;

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
      const signupData: PendingSignupDocument = {
        ...props,
        reviewMessageId: existing.reviewMessageId,
        // if there is already a signup and it is still PENDING we do nothing, otherwise we move it to UPDATE_PENDING
        status:
          existing.status === SignupStatus.PENDING
            ? SignupStatus.PENDING
            : SignupStatus.UPDATE_PENDING,
        expiresAt,
      };
      const updateData: UpdateData<SignupDocument> = {
        ...signupData,
        declineReason: FieldValue.delete(),
        partyStatus: FieldValue.delete(),
        progPoint: FieldValue.delete(),
        reviewedBy: FieldValue.delete(),
      };

      await document.update(updateData);
      return signupData;
    }

    const signupData: PendingSignupDocument = {
      ...props,
      expiresAt,
      status: SignupStatus.PENDING,
    };

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
   * Updates the approval status of a signup. Does not modify the timestamp of the signup
   * @param status - new status for the signup
   * @param key - composite key for the signup
   * @param reviewedBy - discordId of the user that reviewed the signup
   * @returns
   */
  @SentryTraced()
  public approveSignup(
    {
      partyStatus,
      progPoint,
      ...key
    }: SignupCompositeKey &
      Pick<ApprovedSignupDocument, 'progPoint' | 'partyStatus'>,
    reviewedBy: string,
  ) {
    const updateData: UpdateData<SignupDocument> = {
      declineReason: FieldValue.delete(),
      partyStatus,
      progPoint,
      reviewedBy,
      status: SignupStatus.APPROVED,
    };

    return this.collection
      .doc(SignupCollection.getKeyForSignup(key))
      .update(updateData);
  }

  @SentryTraced()
  public declineSignup(key: SignupCompositeKey, reviewedBy: string) {
    const updateData: UpdateData<SignupDocument> = {
      partyStatus: FieldValue.delete(),
      progPoint: FieldValue.delete(),
      reviewedBy,
      status: SignupStatus.DECLINED,
    };

    return this.collection
      .doc(SignupCollection.getKeyForSignup(key))
      .update(updateData);
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
