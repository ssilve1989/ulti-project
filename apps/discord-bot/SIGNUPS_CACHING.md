# Signup Caching Layer Plan

This document outlines the plan to implement an in-memory caching layer for signups to improve performance and provide a data source for the upcoming Astro website.

## 1. Memory Consumption Analysis

To assess the feasibility of an in-memory cache, we first evaluate the memory footprint of storing all signup documents.

### SignupDocument Structure

The `SignupDocument` has the following structure:

```typescript
interface SignupDocument {
  availability: string;
  character: string;
  discordId: string;
  encounter: Encounter;
  notes?: string | null;
  proofOfProgLink?: string | null;
  role: string;
  progPoint?: string;
  progPointRequested: string;
  partyStatus?: PartyStatus;
  partyType?: PartyStatus;
  reviewedBy?: string | null;
  reviewMessageId?: string;
  screenshot?: string | null;
  username: string;
  status: SignupStatus;
  world: string;
  expiresAt: Timestamp;
}
```

### Estimated Size per Document

We estimate the size of a single `SignupDocument` object in memory by approximating the size of its string fields and other data types.

- `availability`: ~200 bytes
- `character`: ~40 bytes
- `discordId`: ~40 bytes
- `encounter`: ~8 bytes
- `notes`: ~50 bytes (average)
- `proofOfProgLink`: ~50 bytes (average)
- `role`: ~20 bytes
- `progPoint`: ~60 bytes
- `progPointRequested`: ~60 bytes
- `partyStatus`: ~40 bytes
- `partyType`: ~40 bytes
- `reviewedBy`: ~40 bytes
- `reviewMessageId`: ~40 bytes
- `screenshot`: ~200 bytes (average, if present)
- `username`: ~40 bytes
- `status`: ~30 bytes
- `world`: ~30 bytes
- `expiresAt`: ~16 bytes

**Total Estimated Size:** ~1 KB per document (including object overhead).

### Total Memory Consumption

Assuming an upper limit of 500 signups, the total estimated memory consumption would be:

**500 documents * 1 KB/document = 500 KB**

Even with a more conservative estimate of 2KB per document, the total memory usage would be approximately 1 MB.

**Conclusion:** The memory overhead is minimal and well within acceptable limits for the application's hosting environment.

## 2. Implementation Plan

We will create a new injectable service, `SignupCacheService`, to manage the in-memory cache. This service will be responsible for initializing, maintaining, and providing access to the cached signup data.

**Note on Multi-Guild Support**: The current `signups` collection in Firestore appears to be global and not partitioned by guild. The `SignupDocument` does not contain a `guildId`. This implementation will assume a single, global collection. If multi-guild support is a requirement, the database schema for signups will need to be revisited to include a `guildId`.

### Architecture

1. **`SignupCacheService`**: A new singleton service (`@Injectable`) that will hold the signups in a `Map<string, SignupDocument>`. The map key will be the Firestore document ID.

2. **`CacheModule`**: A new module `apps/discord-bot/src/cache/cache.module.ts` will be created to house the `SignupCacheService`. This promotes modularity.

3. **Firestore Real-time Listener**: The service will use Firestore's `onSnapshot` method to listen for real-time updates to the `signups` collection.

### `SignupCacheService` Details (`apps/discord-bot/src/cache/signup-cache.service.ts`)

#### Properties

- `private readonly cache = new Map<string, SignupDocument & { id: string }>();`
- `private readonly logger = new Logger(SignupCacheService.name);`
- `private unsubscribe: (() => void) | undefined;`

#### Methods

- **`onApplicationBootstrap()`**:
  - This NestJS lifecycle hook will trigger the cache initialization.
  - It will set up a Firestore `onSnapshot` listener on the root `signups` collection.
  - The listener will handle initial data population and subsequent updates (added, modified, removed documents).

- **`onApplicationShutdown()`**:
  - This hook will call the `unsubscribe` function to detach the Firestore listener and clean up resources.

- **`handleSnapshot(snapshot: QuerySnapshot<SignupDocument>)`**:
  - A private method to process snapshot changes.
  - It will iterate over `snapshot.docChanges()`:
    - For `'added'` and `'modified'` changes, it will `cache.set(doc.id, { ...doc.data(), id: doc.id })`.
    - For `'removed'` changes, it will `cache.delete(doc.id)`.

- **Public Accessors**:
  - `getAll(): (SignupDocument & { id: string })[]` - Returns all signups from the cache.
  - `getById(id: string): (SignupDocument & { id: string }) | undefined` - Retrieves a single signup by its ID.
  - `findBy(predicate: (signup: SignupDocument & { id: string }) => boolean): (SignupDocument & { id: string })[]` - Finds signups matching a predicate.

### Integration with Existing Code

- The `SignupCacheService` will be provided via the new `CacheModule`.
- The `CacheModule` will be imported into `AppModule`.
- Other services that currently fetch signups directly from `SignupCollection` can be refactored to use `SignupCacheService` instead, reducing Firestore reads and improving performance. This refactoring can be done incrementally.

### Example `SignupCacheService` Structure

```typescript
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { CollectionReference, QuerySnapshot, Firestore } from 'firebase-admin/firestore';
import { InjectFirestore } from '../firebase/firebase.decorators';
import { SignupDocument } from '../firebase/models/signup.model';

@Injectable()
export class SignupCacheService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly cache = new Map<string, SignupDocument & { id: string }>();
  private readonly logger = new Logger(SignupCacheService.name);
  private unsubscribe: (() => void) | undefined;

  constructor(@InjectFirestore() private readonly firestore: Firestore) {}

  onApplicationBootstrap() {
    this.logger.log('Initializing signup cache...');
    const collectionRef = this.firestore.collection('signups') as CollectionReference<SignupDocument>;

    this.unsubscribe = collectionRef.onSnapshot(
      (snapshot) => this.handleSnapshot(snapshot),
      (error) => this.logger.error('Error listening to signup changes:', error),
    );
  }

  onApplicationShutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.logger.log('Signup cache listener stopped.');
    }
  }

  private handleSnapshot(snapshot: QuerySnapshot<SignupDocument>) {
    snapshot.docChanges().forEach((change) => {
      const doc = change.doc;
      if (change.type === 'added' || change.type === 'modified') {
        this.logger.debug(`Cached signup: ${doc.id}`);
        this.cache.set(doc.id, { ...doc.data(), id: doc.id });
      } else if (change.type === 'removed') {
        this.logger.debug(`Removed signup from cache: ${doc.id}`);
        this.cache.delete(doc.id);
      }
    });
    this.logger.log(`Cache updated. Total signups: ${this.cache.size}`);
  }

  public getAll(): (SignupDocument & { id: string })[] {
    return Array.from(this.cache.values());
  }

  public findBy(predicate: (value: SignupDocument & { id: string }) => boolean): (SignupDocument & { id: string })[] {
    const results: (SignupDocument & { id: string })[] = [];
    for (const signup of this.cache.values()) {
      if (predicate(signup)) {
        results.push(signup);
      }
    }
    return results;
  }
}
