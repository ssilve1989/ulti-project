# CLI Encounter Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a developer CLI (`pnpm cli`) at `src/cli/main.ts` that manages FFXIV encounter definitions end-to-end — editing TypeScript source constants, seeding Firestore, and optionally looking up FF Logs encounter IDs.

**Architecture:** No NestJS — the CLI initialises Firebase directly via a shared `createFirestore()` factory that `FirebaseModule` also calls, eliminating duplication. Clack handles the terminal UI. Source file editing uses string manipulation (no AST parser).

**Tech Stack:** `@clack/prompts`, `js-yaml`, `firebase-admin`, `graphql-request`, `zod`, `dotenvx` (all already present except `@clack/prompts` and `js-yaml`)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/firebase/create-firestore.ts` | **Create** | Pure factory: `createFirestore(config) → Firestore` |
| `src/firebase/firebase.module.ts` | **Modify** | Use `createFirestore()` instead of inlining init |
| `src/cli/utils/firestore.ts` | **Create** | Plain-function Firestore CRUD for encounters + prog-points |
| `src/cli/utils/config-loader.ts` | **Create** | Load + zod-validate YAML/JSON encounter config files |
| `src/cli/utils/source-editor.ts` | **Create** | String-manipulate `encounters.consts.ts` + `fflogs.consts.ts` |
| `src/cli/utils/fflogs-lookup.ts` | **Create** | GraphQL search for FF Logs encounter IDs |
| `src/cli/commands/encounters/view.ts` | **Create** | Read-only Firestore display |
| `src/cli/commands/encounters/manage-prog-points.ts` | **Create** | Interactive Firestore prog point management |
| `src/cli/commands/encounters/add.ts` | **Create** | Full add-encounter flow (interactive + config file) |
| `src/cli/main.ts` | **Create** | Entry point — routes `encounters` subcommands |
| `package.json` | **Modify** | Add `cli` script + `@clack/prompts` + `js-yaml` devDeps |
| `tsconfig.build.json` | **Modify** | Exclude `src/cli` from production build |

---

## Task 1: Project setup

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.build.json`

- [ ] **Step 1.1: Install dependencies**

```bash
pnpm add -D @clack/prompts js-yaml @types/js-yaml
```

Expected output: packages added to `devDependencies` in `package.json`.

- [ ] **Step 1.2: Add `cli` script to `package.json`**

In `package.json`, add inside the `"scripts"` block (after the `"start"` script):

```json
"cli": "dotenvx run -f .env -- node --experimental-strip-types src/cli/main.ts",
```

- [ ] **Step 1.3: Exclude `src/cli` from the production build**

In `tsconfig.build.json`, update `exclude`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "**/*.spec.ts", "src/cli"],
  "include": ["src/**/*.ts"],
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

- [ ] **Step 1.4: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 1.5: Commit**

```bash
git add package.json tsconfig.build.json
git commit -m "chore: install cli deps and configure build exclusion"
```

---

## Task 2: Extract `createFirestore` factory

**Files:**
- Create: `src/firebase/create-firestore.ts`
- Modify: `src/firebase/firebase.module.ts`

- [ ] **Step 2.1: Create `src/firebase/create-firestore.ts`**

```typescript
import type { App } from 'firebase-admin/app';
import { cert, initializeApp } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface CreateFirestoreConfig {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  databaseId?: string;
  appName?: string;
}

export function createFirestore(config: CreateFirestoreConfig): Firestore {
  const app: App = initializeApp(
    {
      credential: cert({
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
        projectId: config.projectId,
      }),
    },
    config.appName ?? '[DEFAULT]',
  );

  const firestore = config.databaseId
    ? getFirestore(app, config.databaseId)
    : getFirestore(app);

  firestore.settings({ ignoreUndefinedProperties: true });

  return firestore;
}
```

- [ ] **Step 2.2: Update `src/firebase/firebase.module.ts` to use `createFirestore()`**

Replace the two providers (`FIREBASE_APP` and `FIRESTORE`) with a single `FIRESTORE` provider:

```typescript
import { Module } from '@nestjs/common';
import { appConfig } from '../config/app.js';
import { firebaseConfig } from '../config/firebase.js';
import { BlacklistCollection } from './collections/blacklist-collection.js';
import { EncountersCollection } from './collections/encounters-collection.js';
import { JobCollection } from './collections/job/job.collection.js';
import { SettingsCollection } from './collections/settings-collection.js';
import { SignupCollection } from './collections/signup.collection.js';
import { createFirestore } from './create-firestore.js';
import { FIRESTORE } from './firebase.consts.js';

@Module({
  providers: [
    {
      provide: FIRESTORE,
      useFactory: () =>
        createFirestore({
          clientEmail: appConfig.GCP_ACCOUNT_EMAIL,
          privateKey: appConfig.GCP_PRIVATE_KEY,
          projectId: appConfig.GCP_PROJECT_ID,
          databaseId: firebaseConfig.FIRESTORE_DATABASE_ID,
        }),
    },
    SignupCollection,
    SettingsCollection,
    BlacklistCollection,
    JobCollection,
    EncountersCollection,
  ],
  exports: [
    FIRESTORE,
    SignupCollection,
    SettingsCollection,
    BlacklistCollection,
    JobCollection,
    EncountersCollection,
  ],
})
export class FirebaseModule {}
```

- [ ] **Step 2.3: Run typecheck and tests**

```bash
pnpm typecheck && pnpm test:ci
```

Expected: 292 tests pass, no type errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/firebase/create-firestore.ts src/firebase/firebase.module.ts
git commit -m "refactor(firebase): extract createFirestore factory for reuse by CLI"
```

---

## Task 3: CLI Firestore utilities

**Files:**
- Create: `src/cli/utils/firestore.ts`

This file provides plain-function equivalents of `EncountersCollection` methods, taking a `Firestore` instance directly instead of using NestJS DI.

- [ ] **Step 3.1: Create `src/cli/utils/firestore.ts`**

```typescript
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';
import type {
  EncounterDocument,
  ProgPointDocument,
} from '../../firebase/models/encounter.model.js';

function encountersRef(
  db: Firestore,
): CollectionReference<EncounterDocument> {
  return db.collection('encounters') as CollectionReference<EncounterDocument>;
}

function progPointsRef(
  db: Firestore,
  encounterId: string,
): CollectionReference<ProgPointDocument> {
  return encountersRef(db)
    .doc(encounterId)
    .collection('prog-points') as CollectionReference<ProgPointDocument>;
}

export async function getEncounter(
  db: Firestore,
  encounterId: string,
): Promise<(EncounterDocument & { id: string }) | undefined> {
  const doc = await encountersRef(db).doc(encounterId).get();
  const data = doc.data();
  return data ? { ...data, id: doc.id } : undefined;
}

export async function getAllActiveEncounters(
  db: Firestore,
): Promise<(EncounterDocument & { id: string })[]> {
  const snapshot = await encountersRef(db).where('active', '==', true).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

export async function upsertEncounter(
  db: Firestore,
  encounterId: string,
  data: Partial<EncounterDocument>,
): Promise<void> {
  await encountersRef(db).doc(encounterId).set(data, { merge: true });
}

export async function getAllProgPoints(
  db: Firestore,
  encounterId: string,
): Promise<ProgPointDocument[]> {
  const snapshot = await progPointsRef(db, encounterId).orderBy('order').get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function getNextProgPointOrder(
  db: Firestore,
  encounterId: string,
): Promise<number> {
  const snapshot = await progPointsRef(db, encounterId)
    .orderBy('order', 'desc')
    .limit(1)
    .get();
  if (snapshot.empty) return 0;
  return snapshot.docs[0].data().order + 1;
}

export async function addProgPoint(
  db: Firestore,
  encounterId: string,
  progPoint: ProgPointDocument,
): Promise<void> {
  await progPointsRef(db, encounterId).doc(progPoint.id).set(progPoint);
}

export async function updateProgPoint(
  db: Firestore,
  encounterId: string,
  progPointId: string,
  updates: Partial<ProgPointDocument>,
): Promise<void> {
  await progPointsRef(db, encounterId)
    .doc(progPointId)
    .set(updates, { merge: true });
}

export async function deleteProgPoint(
  db: Firestore,
  encounterId: string,
  progPointId: string,
): Promise<void> {
  const ref = progPointsRef(db, encounterId);
  const doc = await ref.doc(progPointId).get();
  const data = doc.data();
  if (!data) throw new Error(`Prog point ${progPointId} not found`);

  await ref.doc(progPointId).delete();

  // Reorder remaining prog points to close the gap
  const snapshot = await ref.where('order', '>', data.order).get();
  if (!snapshot.empty) {
    const batch = db.batch();
    for (const d of snapshot.docs) {
      batch.update(d.ref, { order: d.data().order - 1 });
    }
    await batch.commit();
  }
}

export async function reorderProgPoints(
  db: Firestore,
  encounterId: string,
  ordered: Array<{ id: string; order: number }>,
): Promise<void> {
  const ref = progPointsRef(db, encounterId);
  const batch = db.batch();
  for (const { id, order } of ordered) {
    batch.update(ref.doc(id), { order });
  }
  await batch.commit();
}
```

- [ ] **Step 3.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/cli/utils/firestore.ts
git commit -m "feat(cli): add Firestore utility functions for encounter management"
```

---

## Task 4: Config loader

**Files:**
- Create: `src/cli/utils/config-loader.ts`

- [ ] **Step 4.1: Create `src/cli/utils/config-loader.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { PartyStatus } from '../../firebase/models/signup.model.js';

const ProgPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  partyStatus: z.nativeEnum(PartyStatus),
});

export const EncounterConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Z_]+$/, 'id must be uppercase letters and underscores only'),
  name: z.string().min(1),
  description: z.string().min(1),
  mode: z.enum(['legacy', 'ultimate', 'savage']),
  emoji: z.string().optional(),
  fflogsEncounterIds: z.array(z.number().int().positive()).optional(),
  progPoints: z.array(ProgPointSchema).optional(),
  progPartyThreshold: z.string().optional(),
  clearPartyThreshold: z.string().optional(),
});

export type EncounterConfig = z.infer<typeof EncounterConfigSchema>;

export function loadEncounterConfig(filePath: string): EncounterConfig {
  const ext = extname(filePath).toLowerCase();
  const raw = readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  if (ext === '.yaml' || ext === '.yml') {
    parsed = yaml.load(raw);
  } else if (ext === '.json') {
    parsed = JSON.parse(raw);
  } else {
    throw new Error(`Unsupported config file format: ${ext}. Use .yaml, .yml, or .json`);
  }

  const result = EncounterConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid encounter config:\n${issues}`);
  }

  // Validate threshold references point to defined prog points
  const config = result.data;
  if (config.progPoints && config.progPartyThreshold) {
    const ids = config.progPoints.map((p) => p.id);
    if (!ids.includes(config.progPartyThreshold)) {
      throw new Error(
        `progPartyThreshold '${config.progPartyThreshold}' does not match any prog point id`,
      );
    }
  }
  if (config.progPoints && config.clearPartyThreshold) {
    const ids = config.progPoints.map((p) => p.id);
    if (!ids.includes(config.clearPartyThreshold)) {
      throw new Error(
        `clearPartyThreshold '${config.clearPartyThreshold}' does not match any prog point id`,
      );
    }
  }

  return config;
}
```

- [ ] **Step 4.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add src/cli/utils/config-loader.ts
git commit -m "feat(cli): add YAML/JSON encounter config loader with zod validation"
```

---

## Task 5: Source editor

**Files:**
- Create: `src/cli/utils/source-editor.ts`

This file performs targeted string manipulation on `encounters.consts.ts` and `fflogs.consts.ts`. Each function takes the file source string, makes one change, and returns the updated string. The caller is responsible for reading and writing the file.

- [ ] **Step 5.1: Create `src/cli/utils/source-editor.ts`**

```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve paths relative to the project root (two levels up from src/cli/utils/)
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const ENCOUNTERS_CONSTS_PATH = resolve(ROOT, 'src/encounters/encounters.consts.ts');
export const FFLOGS_CONSTS_PATH = resolve(ROOT, 'src/fflogs/fflogs.consts.ts');

export interface SourceChange {
  file: string;
  description: string;
}

export interface EncounterSourceEdits {
  id: string;        // enum key, e.g. 'FRU_NEW'
  value: string;     // enum value (same as id), e.g. 'FRU_NEW'
  name: string;      // EncounterFriendlyDescription entry
  description: string; // short description
  mode: 'legacy' | 'ultimate' | 'savage';
  emoji?: string;
  fflogsIds?: number[];
  ultimateToFlip?: string; // enum key of existing ultimate to move to legacy
}

// ─── Readers ─────────────────────────────────────────────────────────────────

export function readEncountersConsts(): string {
  return readFileSync(ENCOUNTERS_CONSTS_PATH, 'utf-8');
}

export function readFflogsConsts(): string {
  return readFileSync(FFLOGS_CONSTS_PATH, 'utf-8');
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/**
 * Returns enum keys of all encounters currently tagged `mode: 'ultimate'`
 * in ENCOUNTER_CHOICES.
 */
export function detectCurrentUltimates(source: string): string[] {
  const matches: string[] = [];
  const regex = /value:\s*Encounter\.(\w+),\s*\n\s*mode:\s*'ultimate'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// ─── Mutators (pure: take source string, return updated string) ──────────────

/** Appends `  KEY = 'VALUE',` inside the Encounter enum block. */
export function addToEncounterEnum(source: string, key: string, value: string): string {
  const marker = 'export enum Encounter {';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) throw new Error('Could not find Encounter enum in encounters.consts.ts');

  const closingIdx = source.indexOf('\n}', startIdx);
  if (closingIdx === -1) throw new Error('Could not find closing brace of Encounter enum');

  return source.slice(0, closingIdx) + `\n  ${key} = '${value}',` + source.slice(closingIdx);
}

/** Appends `  [Encounter.KEY]: 'value',` inside EncounterFriendlyDescription. */
export function addToEncounterFriendlyDescription(
  source: string,
  key: string,
  value: string,
): string {
  const marker = 'export const EncounterFriendlyDescription = Object.freeze({';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find EncounterFriendlyDescription in encounters.consts.ts');

  const closingIdx = source.indexOf('\n});', startIdx);
  if (closingIdx === -1)
    throw new Error('Could not find closing of EncounterFriendlyDescription');

  return (
    source.slice(0, closingIdx) +
    `\n  [Encounter.${key}]: '${value}',` +
    source.slice(closingIdx)
  );
}

/** Appends `  [Encounter.KEY]: 'snowflakeId',` inside EncounterEmoji. */
export function addToEncounterEmoji(source: string, key: string, snowflake: string): string {
  const marker = 'export const EncounterEmoji: Record<string, string> = Object.freeze({';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find EncounterEmoji in encounters.consts.ts');

  const closingIdx = source.indexOf('\n});', startIdx);
  if (closingIdx === -1) throw new Error('Could not find closing of EncounterEmoji');

  return (
    source.slice(0, closingIdx) +
    `\n  [Encounter.${key}]: '${snowflake}',` +
    source.slice(closingIdx)
  );
}

/** Appends a `{ name, value, mode }` object inside ENCOUNTER_CHOICES. */
export function addToEncounterChoices(
  source: string,
  name: string,
  key: string,
  mode: string,
): string {
  const marker = 'export const ENCOUNTER_CHOICES: Readonly<EncounterChoice>[] = [';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find ENCOUNTER_CHOICES in encounters.consts.ts');

  const closingIdx = source.indexOf('\n];', startIdx);
  if (closingIdx === -1) throw new Error('Could not find closing of ENCOUNTER_CHOICES');

  const entry = `\n  {\n    name: '${name}',\n    value: Encounter.${key},\n    mode: '${mode}',\n  },`;
  return source.slice(0, closingIdx) + entry + source.slice(closingIdx);
}

/**
 * Changes an existing ENCOUNTER_CHOICES entry from `mode: 'ultimate'` to `mode: 'legacy'`.
 * `key` is the Encounter enum key (e.g. 'FRU').
 */
export function flipEncounterModeToLegacy(source: string, key: string): string {
  const target = `    value: Encounter.${key},\n    mode: 'ultimate',`;
  const replacement = `    value: Encounter.${key},\n    mode: 'legacy',`;
  if (!source.includes(target)) {
    throw new Error(
      `Could not find ENCOUNTER_CHOICES entry for ${key} with mode: 'ultimate'`,
    );
  }
  return source.replace(target, replacement);
}

/** Appends `  [Encounter.KEY, [id1, id2]],` inside the EncounterIds Map. */
export function addToEncounterIds(
  source: string,
  key: string,
  ids: number[],
): string {
  const marker = 'export const EncounterIds = new Map<Encounter, number[]>([';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1)
    throw new Error('Could not find EncounterIds in fflogs.consts.ts');

  const closingIdx = source.indexOf('\n]);', startIdx);
  if (closingIdx === -1) throw new Error('Could not find closing of EncounterIds Map');

  return (
    source.slice(0, closingIdx) +
    `\n  [Encounter.${key}, [${ids.join(', ')}]],` +
    source.slice(closingIdx)
  );
}

// ─── Writers ──────────────────────────────────────────────────────────────────

export function writeEncountersConsts(source: string): void {
  writeFileSync(ENCOUNTERS_CONSTS_PATH, source, 'utf-8');
}

export function writeFflogsConsts(source: string): void {
  writeFileSync(FFLOGS_CONSTS_PATH, source, 'utf-8');
}

// ─── High-level planner ───────────────────────────────────────────────────────

/**
 * Returns a preview of all changes that would be applied, without writing anything.
 * Used for --dry-run output and confirmation prompts.
 */
export function planSourceEdits(edits: EncounterSourceEdits): SourceChange[] {
  const changes: SourceChange[] = [];

  changes.push({
    file: 'src/encounters/encounters.consts.ts',
    description: `+ Encounter enum: ${edits.id} = '${edits.value}'`,
  });
  changes.push({
    file: 'src/encounters/encounters.consts.ts',
    description: `+ EncounterFriendlyDescription: [Encounter.${edits.id}]: '${edits.name}'`,
  });
  if (edits.emoji) {
    changes.push({
      file: 'src/encounters/encounters.consts.ts',
      description: `+ EncounterEmoji: [Encounter.${edits.id}]: '${edits.emoji}'`,
    });
  }
  changes.push({
    file: 'src/encounters/encounters.consts.ts',
    description: `+ ENCOUNTER_CHOICES: { name: '${edits.name}', value: Encounter.${edits.id}, mode: '${edits.mode}' }`,
  });
  if (edits.ultimateToFlip) {
    changes.push({
      file: 'src/encounters/encounters.consts.ts',
      description: `~ ENCOUNTER_CHOICES[${edits.ultimateToFlip}]: mode 'ultimate' → 'legacy'`,
    });
  }
  if (edits.fflogsIds && edits.fflogsIds.length > 0) {
    changes.push({
      file: 'src/fflogs/fflogs.consts.ts',
      description: `+ EncounterIds: [Encounter.${edits.id}, [${edits.fflogsIds.join(', ')}]]`,
    });
  }

  return changes;
}

/**
 * Applies all source edits in-place. Throws on the first error — no partial writes
 * (each file is computed fully before being written).
 */
export function applySourceEdits(edits: EncounterSourceEdits): void {
  // Compute the full updated encounters.consts.ts before writing
  let encountersSource = readEncountersConsts();
  encountersSource = addToEncounterEnum(encountersSource, edits.id, edits.value);
  encountersSource = addToEncounterFriendlyDescription(encountersSource, edits.id, edits.name);
  if (edits.emoji) {
    encountersSource = addToEncounterEmoji(encountersSource, edits.id, edits.emoji);
  }
  if (edits.ultimateToFlip) {
    encountersSource = flipEncounterModeToLegacy(encountersSource, edits.ultimateToFlip);
  }
  encountersSource = addToEncounterChoices(encountersSource, edits.name, edits.id, edits.mode);

  // Compute the full updated fflogs.consts.ts before writing
  let fflogsSource: string | undefined;
  if (edits.fflogsIds && edits.fflogsIds.length > 0) {
    fflogsSource = readFflogsConsts();
    fflogsSource = addToEncounterIds(fflogsSource, edits.id, edits.fflogsIds);
  }

  // Write both files (atomic per file — full rewrite)
  writeEncountersConsts(encountersSource);
  if (fflogsSource !== undefined) {
    writeFflogsConsts(fflogsSource);
  }
}
```

- [ ] **Step 5.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5.3: Commit**

```bash
git add src/cli/utils/source-editor.ts
git commit -m "feat(cli): add source editor for encounters.consts.ts and fflogs.consts.ts"
```

---

## Task 6: FF Logs lookup

**Files:**
- Create: `src/cli/utils/fflogs-lookup.ts`

- [ ] **Step 6.1: Create `src/cli/utils/fflogs-lookup.ts`**

```typescript
import { GraphQLClient, gql } from 'graphql-request';

const FFLOGS_API_URL = 'https://www.fflogs.com/api/v2/client';

const WorldDataQuery = gql`
  query worldData {
    worldData {
      zones {
        id
        name
        encounters {
          id
          name
        }
      }
    }
  }
`;

interface FflogsEncounterResult {
  id: number;
  name: string;
  zoneName: string;
  zoneId: number;
}

interface WorldDataQueryResult {
  worldData: {
    zones: Array<{
      id: number;
      name: string;
      encounters: Array<{
        id: number;
        name: string;
      }> | null;
    }> | null;
  } | null;
}

// In-memory cache for the duration of the CLI session
let cachedResults: FflogsEncounterResult[] | null = null;

async function fetchAllEncounters(token: string): Promise<FflogsEncounterResult[]> {
  if (cachedResults) return cachedResults;

  const client = new GraphQLClient(FFLOGS_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await client.request<WorldDataQueryResult>(WorldDataQuery);
  const zones = data.worldData?.zones ?? [];

  const results: FflogsEncounterResult[] = [];
  for (const zone of zones) {
    for (const encounter of zone.encounters ?? []) {
      results.push({
        id: encounter.id,
        name: encounter.name,
        zoneName: zone.name,
        zoneId: zone.id,
      });
    }
  }

  cachedResults = results;
  return results;
}

export async function searchFflogsEncounters(
  token: string,
  query: string,
): Promise<FflogsEncounterResult[]> {
  const all = await fetchAllEncounters(token);
  const lower = query.toLowerCase();
  return all.filter((e) => e.name.toLowerCase().includes(lower));
}

export function clearFflogsCache(): void {
  cachedResults = null;
}
```

- [ ] **Step 6.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add src/cli/utils/fflogs-lookup.ts
git commit -m "feat(cli): add FF Logs encounter ID lookup utility"
```

---

## Task 7: `view` command

**Files:**
- Create: `src/cli/commands/encounters/view.ts`

- [ ] **Step 7.1: Create `src/cli/commands/encounters/view.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../encounters/encounters.consts.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import { getAllActiveEncounters, getAllProgPoints, getEncounter } from '../../utils/firestore.js';

const PARTY_STATUS_ICON: Record<PartyStatus, string> = {
  [PartyStatus.EarlyProgParty]: '🟡',
  [PartyStatus.ProgParty]: '🟠',
  [PartyStatus.ClearParty]: '🔴',
  [PartyStatus.Cleared]: '✅',
};

function formatProgPointRow(index: number, p: {
  id: string;
  label: string;
  partyStatus: PartyStatus;
  active: boolean;
  order: number;
}): string {
  const active = p.active ? '✅' : '❌';
  const icon = PARTY_STATUS_ICON[p.partyStatus] ?? '⚪';
  return `  ${String(index).padEnd(3)} ${active}  ${p.id.padEnd(16)} ${p.label.padEnd(28)} ${icon} ${p.partyStatus}`;
}

async function viewSingleEncounter(db: Firestore, encounterId: string): Promise<void> {
  const [encounter, progPoints] = await Promise.all([
    getEncounter(db, encounterId),
    getAllProgPoints(db, encounterId),
  ]);

  if (!encounter) {
    clack.log.warn(`Encounter '${encounterId}' not found in Firestore.`);
    return;
  }

  const sorted = [...progPoints].sort((a, b) => a.order - b.order);
  const progThreshold = sorted.find((p) => p.id === encounter.progPartyThreshold);
  const clearThreshold = sorted.find((p) => p.id === encounter.clearPartyThreshold);

  clack.log.info(
    [
      `${encounter.name} (${encounterId})`,
      `  Prog threshold:  ${progThreshold ? `${progThreshold.label} (${progThreshold.id})` : 'Not set'}`,
      `  Clear threshold: ${clearThreshold ? `${clearThreshold.label} (${clearThreshold.id})` : 'Not set'}`,
      '',
      `  ${'#'.padEnd(4)} ${''.padEnd(5)} ${'ID'.padEnd(16)} ${'Label'.padEnd(28)} Party Status`,
      `  ${'─'.repeat(80)}`,
      ...sorted.map((p, i) => formatProgPointRow(i, p)),
    ].join('\n'),
  );
}

async function viewAllEncounters(db: Firestore): Promise<void> {
  const active = await getAllActiveEncounters(db);

  if (active.length === 0) {
    clack.log.warn('No active encounters found in Firestore.');
    return;
  }

  const lines = [
    `  ${'ID'.padEnd(8)} ${'Name'.padEnd(36)} ${'Prog Points'.padEnd(12)} Thresholds`,
    `  ${'─'.repeat(72)}`,
  ];

  for (const enc of active) {
    const progPoints = await getAllProgPoints(db, enc.id);
    const hasProg = enc.progPartyThreshold ? '✅' : '❌';
    const hasClear = enc.clearPartyThreshold ? '✅' : '❌';
    lines.push(
      `  ${enc.id.padEnd(8)} ${(enc.name ?? EncounterFriendlyDescription[enc.id as Encounter] ?? enc.id).padEnd(36)} ${String(progPoints.length).padEnd(12)} prog:${hasProg} clear:${hasClear}`,
    );
  }

  clack.log.info(lines.join('\n'));
}

export async function runViewCommand(db: Firestore, encounterId?: string): Promise<void> {
  clack.intro('View Encounter');

  const spinner = clack.spinner();
  spinner.start('Fetching encounter data...');

  try {
    spinner.stop('');
    if (encounterId) {
      await viewSingleEncounter(db, encounterId);
    } else {
      await viewAllEncounters(db);
    }
  } catch (error) {
    spinner.stop('Failed');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  clack.outro('Done');
}
```

- [ ] **Step 7.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7.3: Commit**

```bash
git add src/cli/commands/encounters/view.ts
git commit -m "feat(cli): add encounters view command"
```

---

## Task 8: `manage-prog-points` command

**Files:**
- Create: `src/cli/commands/encounters/manage-prog-points.ts`

- [ ] **Step 8.1: Create `src/cli/commands/encounters/manage-prog-points.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import { Encounter } from '../../../encounters/encounters.consts.js';
import type { ProgPointDocument } from '../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import {
  addProgPoint,
  deleteProgPoint,
  getAllProgPoints,
  getEncounter,
  getNextProgPointOrder,
  reorderProgPoints,
  updateProgPoint,
} from '../../utils/firestore.js';

function cancelIfCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}

async function promptSelectProgPoint(
  db: Firestore,
  encounterId: string,
  message: string,
): Promise<ProgPointDocument> {
  const progPoints = await getAllProgPoints(db, encounterId);
  if (progPoints.length === 0) {
    throw new Error('No prog points found for this encounter.');
  }
  const selected = cancelIfCancel(
    await clack.select({
      message,
      options: progPoints.map((p) => ({
        value: p,
        label: `${p.id} — ${p.label} (${p.partyStatus})${p.active ? '' : ' [inactive]'}`,
      })),
    }),
  );
  return selected;
}

async function handleAdd(db: Firestore, encounterId: string): Promise<void> {
  const id = cancelIfCancel(
    await clack.text({ message: 'Prog point ID (short key, e.g. p1-loop):', validate: (v) => v.trim() ? undefined : 'Required' }),
  );
  const label = cancelIfCancel(
    await clack.text({ message: 'Label (displayed in Discord):', validate: (v) => v.trim() ? undefined : 'Required' }),
  );
  const partyStatus = cancelIfCancel(
    await clack.select({
      message: 'Party status:',
      options: Object.values(PartyStatus).map((v) => ({ value: v, label: v })),
    }),
  );

  const order = await getNextProgPointOrder(db, encounterId);
  const progPoint: ProgPointDocument = {
    id: id.trim(),
    label: label.trim(),
    partyStatus,
    order,
    active: true,
  };

  const spinner = clack.spinner();
  spinner.start('Adding prog point...');
  await addProgPoint(db, encounterId, progPoint);
  spinner.stop(`Added: ${progPoint.id} — ${progPoint.label}`);
}

async function handleEdit(db: Firestore, encounterId: string): Promise<void> {
  const progPoint = await promptSelectProgPoint(db, encounterId, 'Select prog point to edit:');

  const field = cancelIfCancel(
    await clack.select({
      message: 'What would you like to edit?',
      options: [
        { value: 'label', label: 'Label' },
        { value: 'partyStatus', label: 'Party status' },
      ],
    }),
  );

  let updates: Partial<ProgPointDocument> = {};

  if (field === 'label') {
    const label = cancelIfCancel(
      await clack.text({ message: 'New label:', initialValue: progPoint.label, validate: (v) => v.trim() ? undefined : 'Required' }),
    );
    updates = { label: label.trim() };
  } else {
    const partyStatus = cancelIfCancel(
      await clack.select({
        message: 'New party status:',
        options: Object.values(PartyStatus).map((v) => ({ value: v, label: v })),
      }),
    );
    updates = { partyStatus };
  }

  const spinner = clack.spinner();
  spinner.start('Updating...');
  await updateProgPoint(db, encounterId, progPoint.id, updates);
  spinner.stop(`Updated ${progPoint.id}`);
}

async function handleToggle(db: Firestore, encounterId: string): Promise<void> {
  const progPoints = await getAllProgPoints(db, encounterId);
  const encounter = await getEncounter(db, encounterId);

  const selected = cancelIfCancel(
    await clack.select({
      message: 'Select prog point to toggle:',
      options: progPoints.map((p) => ({
        value: p,
        label: `${p.active ? '✅' : '❌'} ${p.id} — ${p.label}`,
      })),
    }),
  );

  // Guard: cannot deactivate a threshold
  if (selected.active && encounter) {
    if (
      encounter.progPartyThreshold === selected.id ||
      encounter.clearPartyThreshold === selected.id
    ) {
      clack.log.error(
        `Cannot deactivate '${selected.id}' — it is currently set as a threshold. Update the threshold first.`,
      );
      return;
    }
  }

  const newActive = !selected.active;
  const spinner = clack.spinner();
  spinner.start(`${newActive ? 'Activating' : 'Deactivating'} ${selected.id}...`);
  await updateProgPoint(db, encounterId, selected.id, { active: newActive });
  spinner.stop(`${selected.id} is now ${newActive ? 'active' : 'inactive'}`);
}

async function handleDelete(db: Firestore, encounterId: string): Promise<void> {
  const encounter = await getEncounter(db, encounterId);
  const progPoint = await promptSelectProgPoint(db, encounterId, 'Select prog point to delete:');

  // Guard: cannot delete a threshold
  if (encounter) {
    if (
      encounter.progPartyThreshold === progPoint.id ||
      encounter.clearPartyThreshold === progPoint.id
    ) {
      clack.log.error(
        `Cannot delete '${progPoint.id}' — it is currently set as a threshold. Update the threshold first.`,
      );
      return;
    }
  }

  const confirmed = cancelIfCancel(
    await clack.confirm({ message: `Delete '${progPoint.id} — ${progPoint.label}'? This cannot be undone.` }),
  );
  if (!confirmed) {
    clack.log.info('Deletion cancelled.');
    return;
  }

  const spinner = clack.spinner();
  spinner.start('Deleting...');
  await deleteProgPoint(db, encounterId, progPoint.id);
  spinner.stop(`Deleted ${progPoint.id}`);
}

async function handleReorder(db: Firestore, encounterId: string): Promise<void> {
  const progPoints = await getAllProgPoints(db, encounterId);
  if (progPoints.length < 2) {
    clack.log.warn('Need at least 2 prog points to reorder.');
    return;
  }

  clack.log.info('Current order:');
  for (const p of progPoints) {
    clack.log.message(`  ${p.order}. ${p.id} — ${p.label}`);
  }

  const newOrderInput = cancelIfCancel(
    await clack.text({
      message: 'Enter prog point IDs in new order (comma-separated):',
      placeholder: progPoints.map((p) => p.id).join(', '),
      validate: (v) => {
        const ids = v.split(',').map((s) => s.trim());
        const existing = progPoints.map((p) => p.id);
        const missing = existing.filter((id) => !ids.includes(id));
        const unknown = ids.filter((id) => !existing.includes(id));
        if (missing.length > 0) return `Missing prog points: ${missing.join(', ')}`;
        if (unknown.length > 0) return `Unknown prog points: ${unknown.join(', ')}`;
        return undefined;
      },
    }),
  );

  const orderedIds = newOrderInput.split(',').map((s) => s.trim());
  const ordered = orderedIds.map((id, index) => ({ id, order: index }));

  const spinner = clack.spinner();
  spinner.start('Reordering...');
  await reorderProgPoints(db, encounterId, ordered);
  spinner.stop('Reordered successfully');
}

export async function runManageProgPointsCommand(db: Firestore): Promise<void> {
  clack.intro('Manage Prog Points');

  const encounterId = cancelIfCancel(
    await clack.select({
      message: 'Select encounter:',
      options: Object.values(Encounter).map((v) => ({ value: v, label: v })),
    }),
  );

  // Action loop
  while (true) {
    const action = cancelIfCancel(
      await clack.select({
        message: 'What would you like to do?',
        options: [
          { value: 'add', label: 'Add prog point' },
          { value: 'edit', label: 'Edit prog point' },
          { value: 'toggle', label: 'Toggle active/inactive' },
          { value: 'delete', label: 'Delete prog point' },
          { value: 'reorder', label: 'Reorder prog points' },
          { value: 'exit', label: 'Exit' },
        ],
      }),
    );

    if (action === 'exit') break;

    try {
      if (action === 'add') await handleAdd(db, encounterId);
      else if (action === 'edit') await handleEdit(db, encounterId);
      else if (action === 'toggle') await handleToggle(db, encounterId);
      else if (action === 'delete') await handleDelete(db, encounterId);
      else if (action === 'reorder') await handleReorder(db, encounterId);
    } catch (error) {
      clack.log.error(error instanceof Error ? error.message : String(error));
    }
  }

  clack.outro('Done');
}
```

- [ ] **Step 8.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/cli/commands/encounters/manage-prog-points.ts
git commit -m "feat(cli): add manage-prog-points command"
```

---

## Task 9: `add` command

**Files:**
- Create: `src/cli/commands/encounters/add.ts`

- [ ] **Step 9.1: Create `src/cli/commands/encounters/add.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProgPointDocument } from '../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../firebase/models/signup.model.js';
import type { EncounterConfig } from '../../utils/config-loader.js';
import { loadEncounterConfig } from '../../utils/config-loader.js';
import { addProgPoint, getEncounter, upsertEncounter } from '../../utils/firestore.js';
import { searchFflogsEncounters } from '../../utils/fflogs-lookup.js';
import {
  applySourceEdits,
  detectCurrentUltimates,
  planSourceEdits,
  readEncountersConsts,
  type EncounterSourceEdits,
} from '../../utils/source-editor.js';

export interface AddCommandOptions {
  config?: string;
  dryRun?: boolean;
  yes?: boolean;
  fflogsEncounterId?: string;
}

function cancelIfCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}

async function promptFflogsIds(
  fflogsToken: string | undefined,
  cliFlag?: string,
): Promise<number[]> {
  if (cliFlag) {
    return cliFlag.split(',').map((s) => Number(s.trim()));
  }

  const method = cancelIfCancel(
    await clack.select({
      message: 'FF Logs encounter IDs:',
      options: [
        ...(fflogsToken
          ? [{ value: 'search' as const, label: 'Search FF Logs by name' }]
          : []),
        { value: 'manual' as const, label: 'Enter manually' },
        { value: 'skip' as const, label: 'Skip for now' },
      ],
    }),
  );

  if (method === 'skip') return [];

  if (method === 'manual') {
    const raw = cancelIfCancel(
      await clack.text({
        message: 'Enter FF Logs encounter IDs (comma-separated):',
        validate: (v) => {
          const ids = v.split(',').map((s) => Number(s.trim()));
          return ids.every((n) => Number.isInteger(n) && n > 0)
            ? undefined
            : 'Must be comma-separated positive integers';
        },
      }),
    );
    return raw.split(',').map((s) => Number(s.trim()));
  }

  // Search
  const query = cancelIfCancel(
    await clack.text({ message: 'Search term:', validate: (v) => v.trim() ? undefined : 'Required' }),
  );

  const spinner = clack.spinner();
  spinner.start('Searching FF Logs...');
  const results = await searchFflogsEncounters(fflogsToken!, query);
  spinner.stop(`Found ${results.length} results`);

  if (results.length === 0) {
    clack.log.warn('No results found. Falling back to manual entry.');
    const raw = cancelIfCancel(
      await clack.text({ message: 'Enter FF Logs encounter IDs (comma-separated):' }),
    );
    return raw.split(',').map((s) => Number(s.trim()));
  }

  const selected = cancelIfCancel(
    await clack.multiselect({
      message: 'Select matching encounters:',
      options: results.map((r) => ({
        value: r.id,
        label: `${r.name} (${r.zoneName}) — ID: ${r.id}`,
      })),
    }),
  );

  return selected as number[];
}

async function promptProgPoints(): Promise<
  Array<{ id: string; label: string; partyStatus: PartyStatus }>
> {
  const progPoints: Array<{ id: string; label: string; partyStatus: PartyStatus }> = [];

  while (true) {
    const addMore = cancelIfCancel(
      await clack.confirm({
        message:
          progPoints.length === 0
            ? 'Add prog points now?'
            : `Add another prog point? (${progPoints.length} added so far)`,
      }),
    );
    if (!addMore) break;

    const id = cancelIfCancel(
      await clack.text({ message: 'Prog point ID:', validate: (v) => v.trim() ? undefined : 'Required' }),
    );
    const label = cancelIfCancel(
      await clack.text({ message: 'Label (shown in Discord):', validate: (v) => v.trim() ? undefined : 'Required' }),
    );
    const partyStatus = cancelIfCancel(
      await clack.select({
        message: 'Party status:',
        options: Object.values(PartyStatus).map((v) => ({ value: v, label: v })),
      }),
    );

    progPoints.push({ id: id.trim(), label: label.trim(), partyStatus });
  }

  return progPoints;
}

async function promptThreshold(
  message: string,
  progPoints: Array<{ id: string; label: string }>,
): Promise<string | undefined> {
  if (progPoints.length === 0) return undefined;

  const value = cancelIfCancel(
    await clack.select({
      message,
      options: [
        { value: '', label: 'Skip' },
        ...progPoints.map((p) => ({ value: p.id, label: `${p.id} — ${p.label}` })),
      ],
    }),
  );

  return value === '' ? undefined : value;
}

async function buildConfigFromPrompts(
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<EncounterConfig> {
  const id = cancelIfCancel(
    await clack.text({
      message: 'Encounter ID (uppercase, e.g. FRU_NEW):',
      validate: (v) => /^[A-Z_]+$/.test(v.trim()) ? undefined : 'Must be uppercase letters and underscores only',
    }),
  );
  const name = cancelIfCancel(
    await clack.text({ message: 'Full name (e.g. Futures Rewritten (Ultimate)):' , validate: (v) => v.trim() ? undefined : 'Required' }),
  );
  const description = cancelIfCancel(
    await clack.text({ message: 'Short description (e.g. [FRU] Futures Rewritten):', validate: (v) => v.trim() ? undefined : 'Required' }),
  );
  const mode = cancelIfCancel(
    await clack.select({
      message: 'Application mode:',
      options: [
        { value: 'ultimate' as const, label: 'ultimate — current active ultimate' },
        { value: 'legacy' as const, label: 'legacy — past/retired encounter' },
        { value: 'savage' as const, label: 'savage' },
      ],
    }),
  );
  const emojiRaw = cancelIfCancel(
    await clack.text({ message: 'Discord emoji snowflake ID (optional, press Enter to skip):' }),
  );
  const emoji = emojiRaw.trim() || undefined;

  const fflogsEncounterIds = await promptFflogsIds(fflogsToken, opts.fflogsEncounterId);
  const progPoints = await promptProgPoints();
  const progPartyThreshold = await promptThreshold('Set prog party threshold:', progPoints);
  const clearPartyThreshold = await promptThreshold('Set clear party threshold:', progPoints);

  return {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
    mode,
    emoji,
    fflogsEncounterIds: fflogsEncounterIds.length > 0 ? fflogsEncounterIds : undefined,
    progPoints: progPoints.length > 0 ? progPoints : undefined,
    progPartyThreshold,
    clearPartyThreshold,
  };
}

function buildSourceEdits(config: EncounterConfig, ultimateToFlip?: string): EncounterSourceEdits {
  return {
    id: config.id,
    value: config.id,
    name: config.name,
    description: config.description,
    mode: config.mode,
    emoji: config.emoji,
    fflogsIds: config.fflogsEncounterIds,
    ultimateToFlip,
  };
}

export async function runAddCommand(
  db: Firestore,
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<void> {
  clack.intro('Add New Encounter');

  // ── Load config ──────────────────────────────────────────────────────────
  let config: EncounterConfig;
  if (opts.config) {
    const spinner = clack.spinner();
    spinner.start(`Loading config from ${opts.config}...`);
    try {
      config = loadEncounterConfig(opts.config);
      spinner.stop(`Config loaded: ${config.id}`);
    } catch (error) {
      spinner.stop('Failed to load config');
      clack.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  } else {
    config = await buildConfigFromPrompts(fflogsToken, opts);
  }

  // ── Detect ultimate cascade ───────────────────────────────────────────────
  let ultimateToFlip: string | undefined;
  if (config.mode === 'ultimate') {
    const source = readEncountersConsts();
    const currentUltimates = detectCurrentUltimates(source);

    if (currentUltimates.length > 1) {
      clack.log.error(
        `Found multiple encounters with mode 'ultimate': ${currentUltimates.join(', ')}. Fix this manually before proceeding.`,
      );
      process.exit(1);
    }

    if (currentUltimates.length === 1) {
      const existing = currentUltimates[0];
      clack.log.warn(`'${existing}' is currently mode: ultimate.`);
      const flip = cancelIfCancel(
        await clack.confirm({
          message: `Move '${existing}' to legacy?`,
        }),
      );
      if (!flip) {
        clack.cancel('Aborted — existing ultimate not moved.');
        process.exit(0);
      }
      ultimateToFlip = existing;
    }
  }

  // ── Plan source edits ─────────────────────────────────────────────────────
  const sourceEdits = buildSourceEdits(config, ultimateToFlip);
  const changes = planSourceEdits(sourceEdits);

  clack.log.info('Planned source file changes:');
  for (const change of changes) {
    clack.log.message(`  ${change.file}\n    ${change.description}`);
  }

  if (opts.dryRun) {
    clack.log.info('Firestore: would create encounter document + prog points (dry-run)');
    clack.outro('Dry-run complete — no changes applied.');
    return;
  }

  // ── Confirm + apply source edits ─────────────────────────────────────────
  const applySource = opts.yes
    ? true
    : cancelIfCancel(await clack.confirm({ message: 'Apply source file changes?' }));

  if (applySource) {
    const spinner = clack.spinner();
    spinner.start('Editing source files...');
    try {
      applySourceEdits(sourceEdits);
      spinner.stop('Source files updated');
    } catch (error) {
      spinner.stop('Failed');
      clack.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // ── Confirm + seed Firestore ──────────────────────────────────────────────
  const seedFirestore = opts.yes
    ? true
    : cancelIfCancel(await clack.confirm({ message: 'Seed Firestore?' }));

  if (seedFirestore) {
    const existing = await getEncounter(db, config.id);
    if (existing) {
      const overwrite = opts.yes
        ? true
        : cancelIfCancel(
            await clack.confirm({
              message: `Encounter '${config.id}' already exists in Firestore. Overwrite?`,
            }),
          );
      if (!overwrite) {
        clack.log.info('Firestore seeding skipped.');
        clack.outro('Done');
        return;
      }
    }

    const spinner = clack.spinner();
    spinner.start('Creating encounter document...');
    try {
      await upsertEncounter(db, config.id, {
        name: config.name,
        description: config.description,
        active: true,
        progPartyThreshold: config.progPartyThreshold,
        clearPartyThreshold: config.clearPartyThreshold,
      });
      spinner.stop('Encounter document created');
    } catch (error) {
      spinner.stop('Failed to create encounter document');
      clack.log.error(error instanceof Error ? error.message : String(error));
      clack.log.warn('Encounter document may not have been created. No prog points were written.');
      process.exit(1);
    }

    if (config.progPoints && config.progPoints.length > 0) {
      const ppSpinner = clack.spinner();
      ppSpinner.start(`Adding ${config.progPoints.length} prog points...`);
      let addedCount = 0;
      try {
        for (let i = 0; i < config.progPoints.length; i++) {
          const pp = config.progPoints[i];
          const progPoint: ProgPointDocument = {
            id: pp.id,
            label: pp.label,
            partyStatus: pp.partyStatus,
            order: i,
            active: true,
          };
          await addProgPoint(db, config.id, progPoint);
          addedCount++;
        }
        ppSpinner.stop(`Added ${addedCount} prog points`);
      } catch (error) {
        ppSpinner.stop(`Failed after ${addedCount}/${config.progPoints.length} prog points`);
        clack.log.error(error instanceof Error ? error.message : String(error));
        clack.log.warn(
          `Partial write: ${addedCount} of ${config.progPoints.length} prog points were added. Use 'manage-prog-points' to complete.`,
        );
        process.exit(1);
      }
    }
  }

  clack.outro(`Encounter '${config.id}' added successfully.`);
}
```

- [ ] **Step 9.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9.3: Commit**

```bash
git add src/cli/commands/encounters/add.ts
git commit -m "feat(cli): add encounters add command"
```

---

## Task 10: Entry point and smoke test

**Files:**
- Create: `src/cli/main.ts`

- [ ] **Step 10.1: Create `src/cli/main.ts`**

```typescript
import * as clack from '@clack/prompts';
import { appConfig } from '../config/app.js';
import { firebaseConfig } from '../config/firebase.js';
import { createFirestore } from '../firebase/create-firestore.js';
import type { AddCommandOptions } from './commands/encounters/add.js';
import { runAddCommand } from './commands/encounters/add.js';
import { runManageProgPointsCommand } from './commands/encounters/manage-prog-points.js';
import { runViewCommand } from './commands/encounters/view.js';

function parseArgs(argv: string[]): {
  command: string;
  subcommand: string;
  encounterId?: string;
  opts: AddCommandOptions & { encounterId?: string };
} {
  const args = argv.slice(2); // remove 'node' and script path

  const command = args[0] ?? '';
  const subcommand = args[1] ?? '';

  const opts: AddCommandOptions & { encounterId?: string } = {};

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && args[i + 1]) {
      opts.config = args[++i];
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--yes') {
      opts.yes = true;
    } else if (arg === '--fflogs-encounter-id' && args[i + 1]) {
      opts.fflogsEncounterId = args[++i];
    } else if (!arg.startsWith('--')) {
      opts.encounterId = arg;
    }
  }

  return { command, subcommand, opts };
}

function printUsage(): void {
  console.log(`
Usage: pnpm cli <command> <subcommand> [options]

Commands:
  encounters add                   Add a new encounter (interactive or --config)
  encounters manage-prog-points    Manage prog points for an encounter
  encounters view [encounter-id]   View encounter configuration from Firestore

Options for 'encounters add':
  --config <path>                  Load encounter from YAML/JSON file
  --dry-run                        Print planned changes without applying
  --yes                            Skip confirmation prompts
  --fflogs-encounter-id <ids>      Comma-separated FF Logs encounter IDs
`);
}

async function main(): Promise<void> {
  const { command, subcommand, opts } = parseArgs(process.argv);

  if (!command || command === 'help') {
    printUsage();
    process.exit(0);
  }

  if (command !== 'encounters') {
    clack.log.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  if (!subcommand) {
    clack.log.error('Missing subcommand for encounters.');
    printUsage();
    process.exit(1);
  }

  // Initialise Firestore
  const db = createFirestore({
    clientEmail: appConfig.GCP_ACCOUNT_EMAIL,
    privateKey: appConfig.GCP_PRIVATE_KEY,
    projectId: appConfig.GCP_PROJECT_ID,
    databaseId: firebaseConfig.FIRESTORE_DATABASE_ID,
    appName: 'cli',
  });

  const fflogsToken = appConfig.FFLOGS_API_ACCESS_TOKEN;

  if (subcommand === 'add') {
    await runAddCommand(db, fflogsToken, opts);
  } else if (subcommand === 'manage-prog-points') {
    await runManageProgPointsCommand(db);
  } else if (subcommand === 'view') {
    await runViewCommand(db, opts.encounterId);
  } else {
    clack.log.error(`Unknown encounters subcommand: ${subcommand}`);
    printUsage();
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 10.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 10.3: Smoke test — verify CLI help output**

```bash
pnpm cli help
```

Expected: prints the usage message without errors.

- [ ] **Step 10.4: Smoke test — verify `view` starts without crashing**

This requires a valid `.env` file with Firebase credentials. If `.env` is not available, skip to Step 10.5.

```bash
pnpm cli encounters view
```

Expected: Clack intro displays, Firebase connects, either shows encounter data or a "not found" message.

- [ ] **Step 10.5: Run full test suite to confirm nothing is broken**

```bash
pnpm test:ci
```

Expected: 292 tests pass.

- [ ] **Step 10.6: Commit**

```bash
git add src/cli/main.ts
git commit -m "feat(cli): add CLI entry point — encounters add/manage/view commands"
```
