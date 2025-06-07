import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type {
  CollectionReference,
  DocumentChangeType,
} from 'firebase-admin/firestore';
import { Observable, Subject, concat, defer, from, retry, timer } from 'rxjs';
import { match } from 'ts-pattern';
import type { SignupDocument } from '../../models/signup.model.js';
import { SignupCollection } from '../signup.collection.js';

@Injectable()
class SignupDocumentCache implements OnModuleInit {
  private readonly cache: Map<string, SignupDocument> = new Map();
  private readonly logger = new Logger(SignupDocumentCache.name);
  private updates$ = new Subject<{
    type: DocumentChangeType;
    doc: SignupDocument;
  }>();
  /** Used to indicate if we have established the listener and clean it up */
  private unsubscribe: (() => void) | null = null;

  constructor(
    @Inject('SIGNUP_COLLECTION')
    private readonly collection: CollectionReference<SignupDocument>,
  ) {}

  async onModuleInit() {
    this.startListener().subscribe({
      error: (error) => {
        // This should never happen with infinite retry
        this.logger.error('Unexpected error in listener subscription', error);
        Sentry.captureException(error);
      },
    });
  }

  public getStream(): Observable<{
    type: DocumentChangeType;
    doc: SignupDocument;
  }> {
    if (!this.unsubscribe) {
      throw new Error('cache stream not initialized');
    }
    // Emit current cache state, then live updates
    const currentState$ = defer(() =>
      from(
        this.cache.values().map((doc) => ({
          type: 'added' as DocumentChangeType,
          doc,
        })),
      ),
    );

    return concat(currentState$, this.updates$);
  }

  private startListener(): Observable<void> {
    return defer(() => {
      return new Observable<void>((subscriber) => {
        // Initialize the listener asynchronously
        this.initializeListener(subscriber);

        // Cleanup on unsubscribe
        return () => {
          this.unsubscribe?.();
          this.unsubscribe = null;
        };
      });
    }).pipe(
      retry({
        delay: (error, retryCount) => {
          // Exponential backoff with ceiling at 30 seconds
          const delayMs = Math.min(2 ** retryCount * 1000, 30000);

          this.logger.warn(
            `Snapshot listener disconnected. Retrying in ${delayMs}ms (attempt ${retryCount + 1})`,
            error,
          );

          return timer(delayMs);
        },
      }),
    );
  }

  private async initializeListener(subscriber: any): Promise<void> {
    try {
      // Rebuild cache from scratch
      this.cache.clear();

      const snapshot = await this.collection.get();
      for (const doc of snapshot.docs) {
        this.cache.set(
          SignupCollection.getKeyForSignup(doc.data()),
          doc.data(),
        );
      }

      // Set up snapshot listener
      this.unsubscribe = this.collection.onSnapshot(
        (snapshot) => {
          for (const change of snapshot.docChanges()) {
            const doc = change.doc.data();

            match(change.type)
              .with('added', () => {
                this.cache.set(SignupCollection.getKeyForSignup(doc), doc);
                this.logger.log(
                  `Added signup for user ${doc.discordId} to cache`,
                );
              })
              .with('modified', () => {
                this.cache.set(SignupCollection.getKeyForSignup(doc), doc);
                this.logger.log(
                  `Updated signup for user ${doc.discordId} in cache`,
                );
              })
              .with('removed', () => {
                this.cache.delete(SignupCollection.getKeyForSignup(doc));
                this.logger.log(
                  `Removed signup for user ${doc.discordId} from cache`,
                );
              })
              .exhaustive();

            this.updates$.next({ type: change.type, doc });
          }
        },
        (error) => {
          Sentry.captureException(error);
          this.logger.error('Snapshot listener error', error);

          // Signal error to all consumers
          this.updates$.error(new Error('Snapshot listener disconnected'));

          // Create new subject for future streams
          this.updates$ = new Subject();

          // Trigger retry by erroring the observable
          subscriber.error(error);
        },
      );
    } catch (error) {
      // If initialization fails, trigger retry
      subscriber.error(error);
    }
  }
}

export { SignupDocumentCache };
