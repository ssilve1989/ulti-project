# Firestore Emulator Dev Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the bot's (and CLI's) local dev Firestore access over from a live GCP "dev" project to a local Firestore emulator, so contributors don't need real cloud credentials or burn cloud quota to develop locally — and so the phase-2 Cloudflare Pages Function (a separate, later project) has a local Firestore to iterate against too.

**Architecture:** Add `firebase.json`/`.firebaserc` to configure and address the Firestore emulator. Make `src/firebase/create-firestore.ts` — the single factory both the bot and the CLI already share — detect `FIRESTORE_EMULATOR_HOST` and skip real service-account credentials when it's set (this is documented `firebase-admin` SDK behavior, not custom detection logic). Seed data two ways: real encounters come from the existing `pnpm cli encounters push --yes` command reading `data/encounters/*.yaml` (no new code), while signups — which have no YAML source — come from a new small standalone seed script.

**Tech Stack:** `firebase-tools` (emulator suite), `firebase-admin` (already a dependency, used via the existing `createFirestore()` factory), `tsx` (run the new seed script directly from TypeScript source).

**Spec:** `docs/superpowers/specs/2026-08-28-firestore-emulator-dev-cutover-design.md`

## Global Constraints

- `.env.development` is not tracked in git (`.env*` is gitignored repo-wide, and unlike some other env files here it has no committed encrypted copy) — every `.env.development` change in this plan is a local edit + a documented instruction, never a file this plan commits.
- `pnpm test:ci` and every existing spec file must keep passing unmodified — the emulator is local-dev-only tooling and must never be required by CI.
- `.env.production` and the bot's production credential path (`cert()` with real service-account values) are untouched by every task in this plan.
- Repo uses pnpm `11.22.0` (see `packageManager` in `package.json`) and Node `>=22.23.2` (see `engines`).

---

## Task 1: Emulator configuration, dependencies, and scripts

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Modify: `package.json` (add `firebase-tools` + `tsx` devDependencies, add `emulators` script)
- Modify: `.gitignore` (add `.emulator-data/`)

**Interfaces:**
- Produces: `pnpm emulators` — starts the Firestore emulator (port 8080) + Emulator UI (port 4000), importing/exporting state from `./.emulator-data`. Consumed manually by every later task in this plan and by developers going forward.

- [ ] **Step 1: Check for a local Java runtime**

Run: `java -version`
Expected: prints a version. The Firestore emulator is JVM-based and won't start without one. If this fails, install a JRE via your OS's package manager before continuing (this is a one-time local prerequisite, not something this plan can automate — it's environment-specific).

- [ ] **Step 2: Create `firebase.json`**

```json
{
  "emulators": {
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

No `firestore.rules` reference — the bot and CLI only ever talk to the emulator through the Admin SDK, which bypasses Security Rules entirely (rules only apply to client-SDK/REST access with an end-user auth context).

- [ ] **Step 3: Create `.firebaserc`**

```json
{
  "projects": {
    "default": "ulti-project-emulator"
  }
}
```

This id is local-only — it never needs to correspond to a real GCP project. It just lets `firebase emulators:start` run without requiring `--project` on every invocation.

- [ ] **Step 4: Add `firebase-tools` and `tsx` as devDependencies**

Run: `pnpm add -D firebase-tools tsx`
Expected: both appear under `devDependencies` in `package.json`, and `pnpm-lock.yaml` updates accordingly.

- [ ] **Step 5: Add the `emulators` script to `package.json`**

In the `"scripts"` block (alongside the other `pnpm` scripts), add:

```json
"emulators": "firebase emulators:start --import=./.emulator-data --export-on-exit=./.emulator-data",
```

- [ ] **Step 6: Ignore emulator data in git**

In `.gitignore`, add a new line near the other local-state entries (e.g. after the `# Tests` / `/coverage` block):

```
.emulator-data/
```

- [ ] **Step 7: Verify the emulator starts**

Run: `pnpm emulators`
Expected: logs show the Firestore emulator listening on port 8080 and the Emulator UI on port 4000. Visit `http://localhost:4000` in a browser (or `curl -s http://localhost:4000 | head -5`) and confirm it responds. Stop it with Ctrl+C — this also exercises `--export-on-exit`, which should create a `.emulator-data/` directory.

Run: `git status --short .emulator-data`
Expected: no output — confirms `.gitignore` is actually excluding it.

- [ ] **Step 8: Commit**

```bash
git add firebase.json .firebaserc package.json pnpm-lock.yaml .gitignore
git commit -m "chore(firebase): add Firestore emulator configuration"
```

---

## Task 2: Make `createFirestore()` emulator-aware

**Files:**
- Modify: `src/firebase/create-firestore.ts`

**Interfaces:**
- Consumes: nothing new — same `CreateFirestoreConfig` shape (`clientEmail`, `privateKey`, `projectId`, `databaseId?`, `appName?`) already used by `src/firebase/firebase.module.ts` and `src/cli/config.ts`.
- Produces: `createFirestore(config: CreateFirestoreConfig): Firestore` — signature unchanged. When `process.env.FIRESTORE_EMULATOR_HOST` is set, it now initializes the Admin SDK app with only `{ projectId: config.projectId }` (no `cert()` credential) instead of the real service-account credential. This is the function Task 3's seed script relies on.

No new automated test for this file: the change is a straight conditional on `initializeApp`'s config shape (real credential vs. emulator-only projectId), already exercised end-to-end by Task 1's Step 7 (emulator running) combined with Task 3's manual verification (a real write through this exact function). Mocking `firebase-admin/app` internals just to assert which of two known-correct branches ran would test the mock, not real behavior.

- [ ] **Step 1: Update `src/firebase/create-firestore.ts`**

Replace the file's `createFirestore` function body:

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
    process.env.FIRESTORE_EMULATOR_HOST
      ? { projectId: config.projectId }
      : {
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

Only the `initializeApp(...)` call's first argument changed — everything else in the file is identical to what's there today.

- [ ] **Step 2: Typecheck**

Run: `pnpm build:check`
Expected: passes with no errors (this file has no dedicated spec file, so this is the only automated check touching it).

- [ ] **Step 3: Commit**

```bash
git add src/firebase/create-firestore.ts
git commit -m "feat(firebase): detect FIRESTORE_EMULATOR_HOST in createFirestore"
```

---

## Task 3: Seed sample signups

**Files:**
- Create: `scripts/seed-emulator.ts`
- Modify: `tsconfig.typecheck.json` (add the new script to `include`, so it's type-checked in CI like `codegen.ts`/`instrumentation.ts` are)
- Modify: `package.json` (add `seed:emulator` script)

**Interfaces:**
- Consumes: `createFirestore(config: CreateFirestoreConfig): Firestore` (Task 2), `Encounter` enum (`src/encounters/encounters.consts.ts`), `PartyStatus` / `SignupStatus` enums and `SignupDocument` interface (`src/firebase/models/signup.model.ts`).
- Produces: `pnpm seed:emulator` — idempotently writes 5 fixed `signups` documents (by deterministic doc id) to whatever Firestore `createFirestore()` currently points at. Refuses to run unless `FIRESTORE_EMULATOR_HOST` is set, so it can never accidentally write to a real project.

- [ ] **Step 1: Create `scripts/seed-emulator.ts`**

```typescript
import { Timestamp } from 'firebase-admin/firestore';
import { Encounter } from '../src/encounters/encounters.consts.js';
import { createFirestore } from '../src/firebase/create-firestore.js';
import {
  PartyStatus,
  SignupStatus,
  type SignupDocument,
} from '../src/firebase/models/signup.model.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'FIRESTORE_EMULATOR_HOST is not set - refusing to seed. This script only ever writes to the local emulator.',
  );
  process.exit(1);
}

const db = createFirestore({
  clientEmail: 'emulator',
  privateKey: 'emulator',
  projectId: process.env.GCP_PROJECT_ID ?? 'ulti-project-emulator',
});

function getKey(discordId: string, encounter: Encounter): string {
  return `${discordId.toLowerCase()}-${encounter}`;
}

const expiresAt = Timestamp.fromMillis(Date.now() + 28 * 24 * 60 * 60 * 1000);

const signups: Record<string, SignupDocument> = {
  [getKey('100000000000000001', Encounter.FRU)]: {
    character: 'Alice Prog',
    discordId: '100000000000000001',
    encounter: Encounter.FRU,
    role: 'Tank',
    progPoint: 'P4: Enrage',
    progPointRequested: 'P4: Enrage',
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'alice',
    world: 'Excalibur',
    expiresAt,
  },
  [getKey('100000000000000002', Encounter.FRU)]: {
    character: 'Beatrix Clear',
    discordId: '100000000000000002',
    encounter: Encounter.FRU,
    role: 'Healer',
    progPoint: 'P5: Fulgent 1',
    progPointRequested: 'P5: Fulgent 1',
    partyStatus: PartyStatus.ClearParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'beatrix',
    world: 'Excalibur',
    expiresAt,
  },
  [getKey('100000000000000003', Encounter.FRU)]: {
    character: 'Cid Newbie',
    discordId: '100000000000000003',
    encounter: Encounter.FRU,
    role: 'DPS',
    progPointRequested: 'P2: Adds',
    status: SignupStatus.PENDING,
    username: 'cid',
    world: 'Balmung',
    expiresAt,
  },
  [getKey('100000000000000004', Encounter.DSR)]: {
    character: 'Diana Early',
    discordId: '100000000000000004',
    encounter: Encounter.DSR,
    role: 'DPS',
    progPoint: 'Sanctity',
    progPointRequested: 'Sanctity',
    partyStatus: PartyStatus.EarlyProgParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'diana',
    world: 'Balmung',
    expiresAt,
  },
  [getKey('100000000000000005', Encounter.DSR)]: {
    character: 'Elowen Nid',
    discordId: '100000000000000005',
    encounter: Encounter.DSR,
    role: 'Tank',
    progPoint: 'Nidhogg',
    progPointRequested: 'Nidhogg',
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: '900000000000000001',
    status: SignupStatus.APPROVED,
    username: 'elowen',
    world: 'Gilgamesh',
    expiresAt,
  },
};

async function seed(): Promise<void> {
  const batch = db.batch();
  for (const [key, signup] of Object.entries(signups)) {
    batch.set(db.collection('signups').doc(key), signup);
  }
  await batch.commit();
  console.log(`Seeded ${Object.keys(signups).length} signups.`);
}

await seed();
```

Each doc id is deterministic (`getKey`, matching `SignupCollection.getKeyForSignup`'s format), so re-running this script overwrites the same 5 docs rather than accumulating duplicates — that's the idempotency the spec calls for, without wiping any other signups a developer may have created manually while testing.

Four signups are `APPROVED` across three different `partyStatus` values (`ProgParty`, `ClearParty`, `EarlyProgParty`), and one (`Cid Newbie`) is `PENDING` with no `progPoint`/`partyStatus`/`reviewedBy` set — matching an unreviewed signup's real shape.

- [ ] **Step 2: Add the script to the typecheck project**

In `tsconfig.typecheck.json`, add `"scripts/seed-emulator.ts"` to the `include` array:

```json
"include": [
  "src/**/*.spec.ts",
  "codegen.ts",
  "instrumentation.ts",
  "vitest.config.ts",
  "scripts/seed-emulator.ts"
],
```

- [ ] **Step 3: Add the `seed:emulator` script to `package.json`**

```json
"seed:emulator": "dotenvx run -f .env -f .env.development -- tsx scripts/seed-emulator.ts",
```

This matches the exact env-loading pattern `cli`/`start:dev` already use.

- [ ] **Step 4: Typecheck**

Run: `pnpm build:check`
Expected: passes with no errors.

- [ ] **Step 5: Manually verify against a running emulator**

In one terminal: `pnpm emulators`

In another terminal, set up `.env.development` per Task 4's docs (or, for this verification, run inline):

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 GCP_PROJECT_ID=ulti-project-emulator pnpm exec tsx scripts/seed-emulator.ts
```

Expected: prints `Seeded 5 signups.` with no errors. Open `http://localhost:4000/firestore` and confirm a `signups` collection exists with 5 documents matching the data above. Run the same command again — expected: still exactly 5 documents (overwritten, not duplicated).

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-emulator.ts tsconfig.typecheck.json package.json
git commit -m "chore(scripts): add Firestore emulator signup seed script"
```

---

## Task 4: Local dev docs

**Files:**
- Modify: `docs/README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Add a "Local Firestore" subsection to `docs/README.md`**

Insert a new subsection directly after the existing `**Key commands:**` code block, before `## What the Bot Does`:

```markdown
### Local Firestore (one-time setup)

The bot and CLI run against a local Firestore emulator, not a shared cloud project. One-time prerequisites:

- A local Java runtime (the Firestore emulator is JVM-based)
- `.env.development` with `FIRESTORE_EMULATOR_HOST=localhost:8080` and `GCP_PROJECT_ID=ulti-project-emulator` set (matches `.firebaserc`). `GCP_ACCOUNT_EMAIL`/`GCP_PRIVATE_KEY` can be any non-empty placeholder value — they're ignored once `FIRESTORE_EMULATOR_HOST` is set. Leave `FIRESTORE_DATABASE_ID` unset.

Each time you start fresh (or after clearing `.emulator-data/`):

\`\`\`sh
pnpm emulators                    # start the emulator (keep running in its own terminal)
pnpm cli encounters push --yes    # seed all real encounters from data/encounters/*.yaml
pnpm seed:emulator                # seed a handful of sample signups
pnpm start:dev                    # or: pnpm cli
\`\`\`

Emulator data persists across restarts in `.emulator-data/` (gitignored). Inspect it live at the Emulator UI: http://localhost:4000
```

(The `\`\`\`` above is only to escape the fence for this plan document — write a literal triple-backtick code fence in the actual file, language `sh`.)

- [ ] **Step 2: Proofread**

Biome doesn't process Markdown in this repo (`biome.json`'s configured scope excludes it — confirmed: running `biome check` against a `.md` file reports "No files were processed"). There's no automated check for this step: re-read the inserted section against the rendered file and confirm the code fence closes correctly and the commands match Task 1/3's actual script names (`pnpm emulators`, `pnpm seed:emulator`).

- [ ] **Step 3: Commit**

```bash
git add docs/README.md
git commit -m "docs: document local Firestore emulator setup"
```

---

## Final verification

- [ ] Run the full sequence end-to-end from a clean state to confirm every task's pieces fit together:

```bash
rm -rf .emulator-data
pnpm emulators &
sleep 3
pnpm cli encounters push --yes
pnpm seed:emulator
pnpm start:dev
```

Expected: the bot starts cleanly against the emulator, `data/encounters/*.yaml`'s 7 encounters and the 5 seeded signups are all visible in the Emulator UI, and no step required real GCP credentials.

- [ ] Run `pnpm build:check`, `pnpm lint`, `pnpm test:ci` — all must pass unmodified, confirming nothing in this plan touched CI-relevant behavior (per Global Constraints).
