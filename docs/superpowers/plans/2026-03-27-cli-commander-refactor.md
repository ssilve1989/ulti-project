# CLI Commander Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing CLI to use Commander.js for arg parsing and modularise the command files into the directory structure defined in the spec.

**Architecture:** Each command module exports a `register*(parentCmd, getCtx)` factory. A shared `CliContext` (containing `db` and `fflogsToken`) is lazily initialised via a Commander `preAction` hook in `main.ts` so `--help` and `--version` work without env vars. `add.ts` (465 lines) is split into `add/index.ts`, `add/prompts.ts`, and `add/steps.ts`. `manage-prog-points.ts` is split into `manage-prog-points/index.ts` and `manage-prog-points/handlers.ts`. `view.ts` moves to `view/index.ts` with a register wrapper added.

**Tech Stack:** `commander` (new devDep), `@clack/prompts`, `bun` runtime, `firebase-admin`, `zod`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/cli/utils/clack.ts` | **Create** | Shared `cancelIfCancel` helper (currently duplicated) |
| `src/cli/config.ts` | **Create** | `CliContext` type, `cliConfigSchema`, `createCliContext()` |
| `src/cli/commands/encounters/index.ts` | **Create** | `registerEncountersCommand(program, getCtx)` |
| `src/cli/commands/encounters/add/index.ts` | **Create** | `registerAddCommand`, `runAdd` orchestrator, `AddCommandOptions` type |
| `src/cli/commands/encounters/add/prompts.ts` | **Create** | All `@clack/prompts` interactive flows for add |
| `src/cli/commands/encounters/add/steps.ts` | **Create** | `loadOrBuildConfig`, `resolveUltimateCascade`, `buildSourceEdits`, `applySourceEditsStep`, `seedProgPoints`, `seedFirestoreStep` |
| `src/cli/commands/encounters/add.ts` | **Delete** | Replaced by `add/` directory |
| `src/cli/commands/encounters/manage-prog-points/index.ts` | **Create** | `registerManageProgPointsCommand`, `runManageProgPoints` main loop |
| `src/cli/commands/encounters/manage-prog-points/handlers.ts` | **Create** | `promptSelectProgPoint`, `handleAdd/Edit/Toggle/Delete/Reorder`, `dispatchAction` |
| `src/cli/commands/encounters/manage-prog-points.ts` | **Delete** | Replaced by `manage-prog-points/` directory |
| `src/cli/commands/encounters/view/index.ts` | **Create** | `registerViewCommand` wrapper + existing view logic |
| `src/cli/commands/encounters/view.ts` | **Delete** | Replaced by `view/` directory |
| `src/cli/main.ts` | **Rewrite** | Commander program setup, `preAction` hook, `registerEncountersCommand` call |
| `package.json` | **Modify** | Add `commander` to devDependencies |

---

## Task 1: Install Commander + create `utils/clack.ts`

**Files:**
- Modify: `package.json`
- Create: `src/cli/utils/clack.ts`

- [ ] **Step 1.1: Install Commander**

```bash
pnpm add -D commander
```

Expected: `commander` appears in `devDependencies` in `package.json`.

- [ ] **Step 1.2: Create `src/cli/utils/clack.ts`**

```typescript
import * as clack from '@clack/prompts';

export function cancelIfCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}
```

- [ ] **Step 1.3: Remove the local `cancelIfCancel` from `add.ts` and import from the shared util**

In `src/cli/commands/encounters/add.ts`, replace:

```typescript
function cancelIfCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}
```

With this import (add after the existing imports):

```typescript
import { cancelIfCancel } from '../../utils/clack.js';
```

- [ ] **Step 1.4: Remove the local `cancelIfCancel` from `manage-prog-points.ts` and import from the shared util**

In `src/cli/commands/encounters/manage-prog-points.ts`, replace:

```typescript
function cancelIfCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return value;
}
```

With this import (add after the existing imports):

```typescript
import { cancelIfCancel } from '../../utils/clack.js';
```

- [ ] **Step 1.5: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 1.6: Smoke test**

```bash
pnpm cli help
```

Expected: usage text printed (existing hand-rolled help still works at this point).

- [ ] **Step 1.7: Commit**

```bash
git add package.json pnpm-lock.yaml src/cli/utils/clack.ts src/cli/commands/encounters/add.ts src/cli/commands/encounters/manage-prog-points.ts
git commit -m "refactor(cli): extract shared cancelIfCancel to utils/clack.ts"
```

---

## Task 2: Extract `src/cli/config.ts`

**Files:**
- Create: `src/cli/config.ts`
- Modify: `src/cli/main.ts`

- [ ] **Step 2.1: Create `src/cli/config.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { createFirestore } from '../firebase/create-firestore.js';

const cliConfigSchema = z.object({
  GCP_ACCOUNT_EMAIL: z.string(),
  GCP_PRIVATE_KEY: z.string(),
  GCP_PROJECT_ID: z.string(),
  FIRESTORE_DATABASE_ID: z.string().optional(),
  FFLOGS_API_ACCESS_TOKEN: z.string().optional(),
});

export interface CliContext {
  db: Firestore;
  fflogsToken: string | undefined;
}

export function createCliContext(): CliContext {
  const result = cliConfigSchema.safeParse(process.env);
  if (!result.success) {
    clack.log.error(
      `Missing required environment variables:\n${result.error.message}`,
    );
    process.exit(1);
  }
  const config = result.data;
  const db = createFirestore({
    clientEmail: config.GCP_ACCOUNT_EMAIL,
    privateKey: config.GCP_PRIVATE_KEY,
    projectId: config.GCP_PROJECT_ID,
    databaseId: config.FIRESTORE_DATABASE_ID,
    appName: 'cli',
  });
  return { db, fflogsToken: config.FFLOGS_API_ACCESS_TOKEN };
}
```

- [ ] **Step 2.2: Update `main.ts` to import from `config.ts`**

Replace the inline schema + Firestore init in `src/cli/main.ts`. The file should now look like this (keep the existing `parseArgs`/`printUsage`/routing logic unchanged — only replace the config/Firestore block):

```typescript
import * as clack from '@clack/prompts';
import type { AddCommandOptions } from './commands/encounters/add.js';
import { runAddCommand } from './commands/encounters/add.js';
import { runManageProgPointsCommand } from './commands/encounters/manage-prog-points.js';
import { runViewCommand } from './commands/encounters/view.js';
import { createCliContext } from './config.js';

interface ParsedArgs {
  command: string;
  subcommand: string;
  opts: AddCommandOptions & { encounterId?: string };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

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

  const { db, fflogsToken } = createCliContext();

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

- [ ] **Step 2.3: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 2.4: Smoke test**

```bash
pnpm cli help
```

Expected: usage text printed.

- [ ] **Step 2.5: Commit**

```bash
git add src/cli/config.ts src/cli/main.ts
git commit -m "refactor(cli): extract CliContext and env schema to config.ts"
```

---

## Task 3: Split `add.ts` → `add/index.ts` + `add/prompts.ts` + `add/steps.ts`

**Files:**
- Create: `src/cli/commands/encounters/add/prompts.ts`
- Create: `src/cli/commands/encounters/add/steps.ts`
- Create: `src/cli/commands/encounters/add/index.ts`
- Delete: `src/cli/commands/encounters/add.ts`
- Modify: `src/cli/main.ts`

- [ ] **Step 3.1: Create `src/cli/commands/encounters/add/prompts.ts`**

This file contains all interactive prompt flows. Note the import paths go up three levels to `src/cli/utils/` and four levels to `src/firebase/`:

```typescript
import * as clack from '@clack/prompts';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import type { EncounterConfig } from '../../../utils/config-loader.js';
import { searchFflogsEncounters } from '../../../utils/fflogs-lookup.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import type { AddCommandOptions } from './index.js';

async function promptFflogsIds(
  fflogsToken: string | undefined,
  cliFlag?: string,
): Promise<number[]> {
  if (cliFlag) {
    return cliFlag.split(',').map((s) => Number(s.trim()));
  }

  type FflogsMethod = 'search' | 'manual' | 'skip';

  const searchOption = fflogsToken
    ? [{ value: 'search' as FflogsMethod, label: 'Search FF Logs by name' }]
    : [];

  const method = cancelIfCancel(
    await clack.select<FflogsMethod>({
      message: 'FF Logs encounter IDs:',
      options: [
        ...searchOption,
        { value: 'manual' as FflogsMethod, label: 'Enter manually' },
        { value: 'skip' as FflogsMethod, label: 'Skip for now' },
      ],
    }),
  );

  if (method === 'skip') return [];

  if (method === 'manual') {
    const raw = cancelIfCancel(
      await clack.text({
        message: 'Enter FF Logs encounter IDs (comma-separated):',
        validate: (v) => {
          const ids = (v ?? '').split(',').map((s) => Number(s.trim()));
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
    await clack.text({
      message: 'Search term:',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );

  const spinner = clack.spinner();
  spinner.start('Searching FF Logs...');
  // biome-ignore lint/style/noNonNullAssertion: fflogsToken is guaranteed non-null when method === 'search'
  const results = await searchFflogsEncounters(fflogsToken!, query);
  spinner.stop(`Found ${results.length} results`);

  if (results.length === 0) {
    clack.log.warn('No results found. Falling back to manual entry.');
    const raw = cancelIfCancel(
      await clack.text({
        message: 'Enter FF Logs encounter IDs (comma-separated):',
      }),
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
  const progPoints: Array<{
    id: string;
    label: string;
    partyStatus: PartyStatus;
  }> = [];

  for (;;) {
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
      await clack.text({
        message: 'Prog point ID:',
        validate: (v) => (v?.trim() ? undefined : 'Required'),
      }),
    );
    const label = cancelIfCancel(
      await clack.text({
        message: 'Label (shown in Discord):',
        validate: (v) => (v?.trim() ? undefined : 'Required'),
      }),
    );
    const partyStatus = cancelIfCancel(
      await clack.select({
        message: 'Party status:',
        options: Object.values(PartyStatus).map((v) => ({
          value: v,
          label: v,
        })),
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
        ...progPoints.map((p) => ({
          value: p.id,
          label: `${p.id} — ${p.label}`,
        })),
      ],
    }),
  );

  return value === '' ? undefined : value;
}

export async function buildConfigFromPrompts(
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<EncounterConfig> {
  const id = cancelIfCancel(
    await clack.text({
      message: 'Encounter ID (uppercase, e.g. FRU_NEW):',
      validate: (v) =>
        /^[A-Z_]+$/.test((v ?? '').trim())
          ? undefined
          : 'Must be uppercase letters and underscores only',
    }),
  );
  const name = cancelIfCancel(
    await clack.text({
      message: 'Full name (e.g. Futures Rewritten (Ultimate)):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );
  const description = cancelIfCancel(
    await clack.text({
      message: 'Short description (e.g. [FRU] Futures Rewritten):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );

  type AppMode = 'ultimate' | 'legacy' | 'savage';
  const mode = cancelIfCancel(
    await clack.select<AppMode>({
      message: 'Application mode:',
      options: [
        {
          value: 'ultimate' as AppMode,
          label: 'ultimate — current active ultimate',
        },
        {
          value: 'legacy' as AppMode,
          label: 'legacy — past/retired encounter',
        },
        { value: 'savage' as AppMode, label: 'savage' },
      ],
    }),
  );

  const emojiRaw = cancelIfCancel(
    await clack.text({
      message: 'Discord emoji snowflake ID (optional, press Enter to skip):',
    }),
  );
  const emoji = emojiRaw.trim() || undefined;

  const fflogsEncounterIds = await promptFflogsIds(
    fflogsToken,
    opts.fflogsEncounterId,
  );
  const progPoints = await promptProgPoints();
  const progPartyThreshold = await promptThreshold(
    'Set prog party threshold:',
    progPoints,
  );
  const clearPartyThreshold = await promptThreshold(
    'Set clear party threshold:',
    progPoints,
  );

  return {
    id: id.trim(),
    name: name.trim(),
    description: description.trim(),
    mode,
    emoji,
    fflogsEncounterIds:
      fflogsEncounterIds.length > 0 ? fflogsEncounterIds : undefined,
    progPoints: progPoints.length > 0 ? progPoints : undefined,
    progPartyThreshold,
    clearPartyThreshold,
  };
}
```

- [ ] **Step 3.2: Create `src/cli/commands/encounters/add/steps.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProgPointDocument } from '../../../../firebase/models/encounter.model.js';
import type { EncounterConfig } from '../../../utils/config-loader.js';
import { loadEncounterConfig } from '../../../utils/config-loader.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import {
  addProgPoint,
  getEncounter,
  upsertEncounter,
} from '../../../utils/firestore.js';
import {
  applySourceEdits,
  detectCurrentUltimates,
  type EncounterSourceEdits,
  planSourceEdits,
  readEncountersConsts,
} from '../../../utils/source-editor.js';
import { buildConfigFromPrompts } from './prompts.js';
import type { AddCommandOptions } from './index.js';

export function buildSourceEdits(
  config: EncounterConfig,
  ultimateToFlip?: string,
): EncounterSourceEdits {
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

export async function loadOrBuildConfig(
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<EncounterConfig> {
  if (!opts.config) {
    return await buildConfigFromPrompts(fflogsToken, opts);
  }
  const spinner = clack.spinner();
  spinner.start(`Loading config from ${opts.config}...`);
  try {
    const config = loadEncounterConfig(opts.config);
    spinner.stop(`Config loaded: ${config.id}`);
    return config;
  } catch (error) {
    spinner.stop('Failed to load config');
    clack.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export async function resolveUltimateCascade(
  config: EncounterConfig,
): Promise<string | undefined> {
  if (config.mode !== 'ultimate') return undefined;

  const source = readEncountersConsts();
  const currentUltimates = detectCurrentUltimates(source);

  if (currentUltimates.length > 1) {
    clack.log.error(
      `Found multiple encounters with mode 'ultimate': ${currentUltimates.join(', ')}. Fix this manually before proceeding.`,
    );
    process.exit(1);
  }

  if (currentUltimates.length === 0) return undefined;

  const existing = currentUltimates[0];
  clack.log.warn(`'${existing}' is currently mode: ultimate.`);
  const flip = cancelIfCancel(
    await clack.confirm({ message: `Move '${existing}' to legacy?` }),
  );
  if (!flip) {
    clack.cancel('Aborted — existing ultimate not moved.');
    process.exit(0);
  }
  return existing;
}

export async function applySourceEditsStep(
  sourceEdits: EncounterSourceEdits,
  opts: AddCommandOptions,
): Promise<void> {
  const apply = opts.yes
    ? true
    : cancelIfCancel(
        await clack.confirm({ message: 'Apply source file changes?' }),
      );
  if (!apply) return;

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

async function seedProgPoints(
  db: Firestore,
  config: EncounterConfig,
): Promise<void> {
  if (!config.progPoints || config.progPoints.length === 0) return;

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
    ppSpinner.stop(
      `Failed after ${addedCount}/${config.progPoints.length} prog points`,
    );
    clack.log.error(error instanceof Error ? error.message : String(error));
    clack.log.warn(
      `Partial write: ${addedCount} of ${config.progPoints.length} prog points were added. Use 'manage-prog-points' to complete.`,
    );
    process.exit(1);
  }
}

export async function seedFirestoreStep(
  db: Firestore,
  config: EncounterConfig,
  opts: AddCommandOptions,
): Promise<void> {
  const seed = opts.yes
    ? true
    : cancelIfCancel(await clack.confirm({ message: 'Seed Firestore?' }));
  if (!seed) return;

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
      return;
    }
  }

  const encSpinner = clack.spinner();
  encSpinner.start('Creating encounter document...');
  try {
    await upsertEncounter(db, config.id, {
      name: config.name,
      description: config.description,
      active: true,
      progPartyThreshold: config.progPartyThreshold,
      clearPartyThreshold: config.clearPartyThreshold,
    });
    encSpinner.stop('Encounter document created');
  } catch (error) {
    encSpinner.stop('Failed to create encounter document');
    clack.log.error(error instanceof Error ? error.message : String(error));
    clack.log.warn(
      'Encounter document may not have been created. No prog points were written.',
    );
    process.exit(1);
  }

  await seedProgPoints(db, config);
}

export { planSourceEdits };
```

- [ ] **Step 3.3: Create `src/cli/commands/encounters/add/index.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { Command } from 'commander';
import type { CliContext } from '../../../config.js';
import {
  applySourceEditsStep,
  buildSourceEdits,
  loadOrBuildConfig,
  planSourceEdits,
  resolveUltimateCascade,
  seedFirestoreStep,
} from './steps.js';

export interface AddCommandOptions {
  config?: string;
  dryRun?: boolean;
  yes?: boolean;
  fflogsEncounterId?: string;
}

async function runAdd(
  db: Firestore,
  fflogsToken: string | undefined,
  opts: AddCommandOptions,
): Promise<void> {
  clack.intro('Add New Encounter');

  const config = await loadOrBuildConfig(fflogsToken, opts);
  const ultimateToFlip = await resolveUltimateCascade(config);

  const sourceEdits = buildSourceEdits(config, ultimateToFlip);
  const changes = planSourceEdits(sourceEdits);

  clack.log.info('Planned source file changes:');
  for (const change of changes) {
    clack.log.message(`  ${change.file}\n    ${change.description}`);
  }

  if (opts.dryRun) {
    clack.log.info(
      'Firestore: would create encounter document + prog points (dry-run)',
    );
    clack.outro('Dry-run complete — no changes applied.');
    return;
  }

  await applySourceEditsStep(sourceEdits, opts);
  await seedFirestoreStep(db, config, opts);

  clack.outro(`Encounter '${config.id}' added successfully.`);
}

export function registerAddCommand(
  encountersCmd: Command,
  getCtx: () => CliContext,
): void {
  encountersCmd
    .command('add')
    .description('Add a new encounter (interactive or --config)')
    .option('--config <path>', 'Load encounter from YAML/JSON file')
    .option('--dry-run', 'Print planned changes without applying')
    .option('--yes', 'Skip confirmation prompts')
    .option(
      '--fflogs-encounter-id <ids>',
      'Comma-separated FF Logs encounter IDs',
    )
    .action(async (opts: AddCommandOptions) => {
      const { db, fflogsToken } = getCtx();
      await runAdd(db, fflogsToken, opts);
    });
}
```

- [ ] **Step 3.4: Delete `src/cli/commands/encounters/add.ts`**

```bash
git rm src/cli/commands/encounters/add.ts
```

- [ ] **Step 3.5: Update `main.ts` imports to point at the new location**

In `src/cli/main.ts`, replace:

```typescript
import type { AddCommandOptions } from './commands/encounters/add.js';
import { runAddCommand } from './commands/encounters/add.js';
```

With:

```typescript
import type { AddCommandOptions } from './commands/encounters/add/index.js';
import { runAddCommand } from './commands/encounters/add/index.js';
```

Also rename the call from `runAddCommand` to match the new export. In `add/index.ts` the orchestrator function is not exported — only `registerAddCommand` is. For this task we keep `main.ts` routing unchanged; we'll wire Commander in Task 6. So instead, rename the function in `add/index.ts` to export it:

Open `src/cli/commands/encounters/add/index.ts` and change:

```typescript
async function runAdd(
```

to:

```typescript
export async function runAdd(
```

Then `main.ts` imports become:

```typescript
import type { AddCommandOptions } from './commands/encounters/add/index.js';
import { runAdd } from './commands/encounters/add/index.js';
```

And the call site:

```typescript
if (subcommand === 'add') {
  await runAdd(db, fflogsToken, opts);
```

- [ ] **Step 3.6: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3.7: Smoke test**

```bash
pnpm cli help
```

Expected: usage text printed.

- [ ] **Step 3.8: Commit**

```bash
git add src/cli/commands/encounters/add/ src/cli/main.ts
git commit -m "refactor(cli): split add.ts into add/index.ts + prompts.ts + steps.ts"
```

---

## Task 4: Split `manage-prog-points.ts` → `handlers.ts` + `index.ts`

**Files:**
- Create: `src/cli/commands/encounters/manage-prog-points/handlers.ts`
- Create: `src/cli/commands/encounters/manage-prog-points/index.ts`
- Delete: `src/cli/commands/encounters/manage-prog-points.ts`
- Modify: `src/cli/main.ts`

- [ ] **Step 4.1: Create `src/cli/commands/encounters/manage-prog-points/handlers.ts`**

Read the full content of `src/cli/commands/encounters/manage-prog-points.ts` (lines 24–251) and copy those functions here with updated imports:

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { ProgPointDocument } from '../../../../firebase/models/encounter.model.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import {
  addProgPoint,
  deleteProgPoint,
  getAllProgPoints,
  getEncounter,
  getNextProgPointOrder,
  reorderProgPoints,
  updateProgPoint,
} from '../../../utils/firestore.js';
import { cancelIfCancel } from '../../../utils/clack.js';

export async function promptSelectProgPoint(
  db: Firestore,
  encounterId: string,
  message: string,
): Promise<ProgPointDocument> {
  const progPoints = await getAllProgPoints(db, encounterId);
  if (progPoints.length === 0) {
    throw new Error('No prog points found for this encounter.');
  }
  return cancelIfCancel(
    await clack.select({
      message,
      options: progPoints.map((p) => ({
        value: p,
        label: `${p.id} — ${p.label} (${p.partyStatus})${p.active ? '' : ' [inactive]'}`,
      })),
    }),
  );
}

export async function handleAdd(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const id = cancelIfCancel(
    await clack.text({
      message: 'Prog point ID (short key, e.g. p1-loop):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
  );
  const label = cancelIfCancel(
    await clack.text({
      message: 'Label (displayed in Discord):',
      validate: (v) => (v?.trim() ? undefined : 'Required'),
    }),
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

export async function handleEdit(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const progPoint = await promptSelectProgPoint(
    db,
    encounterId,
    'Select prog point to edit:',
  );

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
      await clack.text({
        message: 'New label:',
        initialValue: progPoint.label,
        validate: (v) => (v?.trim() ? undefined : 'Required'),
      }),
    );
    updates = { label: label.trim() };
  } else {
    const partyStatus = cancelIfCancel(
      await clack.select({
        message: 'New party status:',
        options: Object.values(PartyStatus).map((v) => ({
          value: v,
          label: v,
        })),
      }),
    );
    updates = { partyStatus };
  }

  const spinner = clack.spinner();
  spinner.start('Updating...');
  await updateProgPoint(db, encounterId, progPoint.id, updates);
  spinner.stop(`Updated ${progPoint.id}`);
}

export async function handleToggle(
  db: Firestore,
  encounterId: string,
): Promise<void> {
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
  spinner.start(
    `${newActive ? 'Activating' : 'Deactivating'} ${selected.id}...`,
  );
  await updateProgPoint(db, encounterId, selected.id, { active: newActive });
  spinner.stop(`${selected.id} is now ${newActive ? 'active' : 'inactive'}`);
}

export async function handleDelete(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const encounter = await getEncounter(db, encounterId);
  const progPoint = await promptSelectProgPoint(
    db,
    encounterId,
    'Select prog point to delete:',
  );

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
    await clack.confirm({
      message: `Delete '${progPoint.id} — ${progPoint.label}'? This cannot be undone.`,
    }),
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

export async function handleReorder(
  db: Firestore,
  encounterId: string,
): Promise<void> {
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
        const ids = (v ?? '').split(',').map((s) => s.trim());
        const existing = progPoints.map((p) => p.id);
        const missing = existing.filter((id) => !ids.includes(id));
        const unknown = ids.filter((id) => !existing.includes(id));
        if (missing.length > 0)
          return `Missing prog points: ${missing.join(', ')}`;
        if (unknown.length > 0)
          return `Unknown prog points: ${unknown.join(', ')}`;
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

export async function dispatchAction(
  db: Firestore,
  encounterId: string,
  action: string,
): Promise<void> {
  if (action === 'add') await handleAdd(db, encounterId);
  else if (action === 'edit') await handleEdit(db, encounterId);
  else if (action === 'toggle') await handleToggle(db, encounterId);
  else if (action === 'delete') await handleDelete(db, encounterId);
  else if (action === 'reorder') await handleReorder(db, encounterId);
}
```

- [ ] **Step 4.2: Create `src/cli/commands/encounters/manage-prog-points/index.ts`**

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { Command } from 'commander';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import type { CliContext } from '../../../config.js';
import { cancelIfCancel } from '../../../utils/clack.js';
import { dispatchAction } from './handlers.js';

async function runManageProgPoints(db: Firestore): Promise<void> {
  clack.intro('Manage Prog Points');

  const encounterId = cancelIfCancel(
    await clack.select({
      message: 'Select encounter:',
      options: Object.values(Encounter).map((v) => ({ value: v, label: v })),
    }),
  );

  for (;;) {
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
      await dispatchAction(db, encounterId, action);
    } catch (error) {
      clack.log.error(error instanceof Error ? error.message : String(error));
    }
  }

  clack.outro('Done');
}

export function registerManageProgPointsCommand(
  encountersCmd: Command,
  getCtx: () => CliContext,
): void {
  encountersCmd
    .command('manage-prog-points')
    .description('Manage prog points for an encounter')
    .action(async () => {
      const { db } = getCtx();
      await runManageProgPoints(db);
    });
}
```

- [ ] **Step 4.3: Delete `src/cli/commands/encounters/manage-prog-points.ts`**

```bash
git rm src/cli/commands/encounters/manage-prog-points.ts
```

- [ ] **Step 4.4: Update `main.ts` import to point at the new location**

In `src/cli/main.ts`, replace:

```typescript
import { runManageProgPointsCommand } from './commands/encounters/manage-prog-points.js';
```

With:

```typescript
import { runManageProgPoints } from './commands/encounters/manage-prog-points/index.js';
```

Also update the call site from `runManageProgPointsCommand(db)` to `runManageProgPoints(db)`. Add an export to `manage-prog-points/index.ts`:

Open `src/cli/commands/encounters/manage-prog-points/index.ts` and change:

```typescript
async function runManageProgPoints(db: Firestore): Promise<void> {
```

to:

```typescript
export async function runManageProgPoints(db: Firestore): Promise<void> {
```

- [ ] **Step 4.5: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4.6: Smoke test**

```bash
pnpm cli help
```

Expected: usage text printed.

- [ ] **Step 4.7: Commit**

```bash
git add src/cli/commands/encounters/manage-prog-points/ src/cli/main.ts
git commit -m "refactor(cli): split manage-prog-points.ts into handlers.ts + index.ts"
```

---

## Task 5: Move `view.ts` → `view/index.ts`

**Files:**
- Create: `src/cli/commands/encounters/view/index.ts`
- Delete: `src/cli/commands/encounters/view.ts`
- Modify: `src/cli/main.ts`

- [ ] **Step 5.1: Create `src/cli/commands/encounters/view/index.ts`**

Copy all content from `view.ts` verbatim, then add the `registerViewCommand` export and the Commander import. The full file:

```typescript
import * as clack from '@clack/prompts';
import type { Firestore } from 'firebase-admin/firestore';
import type { Command } from 'commander';
import {
  Encounter,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import { PartyStatus } from '../../../../firebase/models/signup.model.js';
import {
  getAllActiveEncounters,
  getAllProgPoints,
  getEncounter,
} from '../../../utils/firestore.js';
import type { CliContext } from '../../../config.js';

const PARTY_STATUS_ICON: Record<PartyStatus, string> = {
  [PartyStatus.EarlyProgParty]: '🟡',
  [PartyStatus.ProgParty]: '🟠',
  [PartyStatus.ClearParty]: '🔴',
  [PartyStatus.Cleared]: '✅',
};

function formatProgPointRow(
  index: number,
  p: {
    id: string;
    label: string;
    partyStatus: PartyStatus;
    active: boolean;
    order: number;
  },
): string {
  const active = p.active ? '✅' : '❌';
  const icon = PARTY_STATUS_ICON[p.partyStatus] ?? '⚪';
  return `  ${String(index).padEnd(3)} ${active}  ${p.id.padEnd(16)} ${p.label.padEnd(28)} ${icon} ${p.partyStatus}`;
}

async function viewSingleEncounter(
  db: Firestore,
  encounterId: string,
): Promise<void> {
  const [encounter, progPoints] = await Promise.all([
    getEncounter(db, encounterId),
    getAllProgPoints(db, encounterId),
  ]);

  if (!encounter) {
    clack.log.warn(`Encounter '${encounterId}' not found in Firestore.`);
    return;
  }

  const sorted = [...progPoints].sort((a, b) => a.order - b.order);
  const progThreshold = sorted.find(
    (p) => p.id === encounter.progPartyThreshold,
  );
  const clearThreshold = sorted.find(
    (p) => p.id === encounter.clearPartyThreshold,
  );

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
    const name =
      enc.name ?? EncounterFriendlyDescription[enc.id as Encounter] ?? enc.id;
    lines.push(
      `  ${enc.id.padEnd(8)} ${name.padEnd(36)} ${String(progPoints.length).padEnd(12)} prog:${hasProg} clear:${hasClear}`,
    );
  }

  clack.log.info(lines.join('\n'));
}

export async function runView(
  db: Firestore,
  encounterId?: string,
): Promise<void> {
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

export function registerViewCommand(
  encountersCmd: Command,
  getCtx: () => CliContext,
): void {
  encountersCmd
    .command('view [encounter-id]')
    .description('View encounter configuration from Firestore')
    .action(async (encounterId?: string) => {
      const { db } = getCtx();
      await runView(db, encounterId);
    });
}
```

- [ ] **Step 5.2: Delete `src/cli/commands/encounters/view.ts`**

```bash
git rm src/cli/commands/encounters/view.ts
```

- [ ] **Step 5.3: Update `main.ts` import to point at the new location**

In `src/cli/main.ts`, replace:

```typescript
import { runViewCommand } from './commands/encounters/view.js';
```

With:

```typescript
import { runView } from './commands/encounters/view/index.js';
```

And update the call site from `runViewCommand(db, opts.encounterId)` to `runView(db, opts.encounterId)`.

- [ ] **Step 5.4: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5.5: Smoke test**

```bash
pnpm cli help
```

Expected: usage text printed.

- [ ] **Step 5.6: Commit**

```bash
git add src/cli/commands/encounters/view/ src/cli/main.ts
git commit -m "refactor(cli): move view.ts to view/index.ts with registerViewCommand"
```

---

## Task 6: Create `encounters/index.ts` and rewrite `main.ts` with Commander

**Files:**
- Create: `src/cli/commands/encounters/index.ts`
- Rewrite: `src/cli/main.ts`

- [ ] **Step 6.1: Create `src/cli/commands/encounters/index.ts`**

```typescript
import type { Command } from 'commander';
import type { CliContext } from '../../config.js';
import { registerAddCommand } from './add/index.js';
import { registerManageProgPointsCommand } from './manage-prog-points/index.js';
import { registerViewCommand } from './view/index.js';

export function registerEncountersCommand(
  program: Command,
  getCtx: () => CliContext,
): void {
  const encountersCmd = program
    .command('encounters')
    .description('Manage encounters');

  registerAddCommand(encountersCmd, getCtx);
  registerManageProgPointsCommand(encountersCmd, getCtx);
  registerViewCommand(encountersCmd, getCtx);
}
```

- [ ] **Step 6.2: Rewrite `src/cli/main.ts`**

Replace the entire file with:

```typescript
import * as clack from '@clack/prompts';
import { Command } from 'commander';
import type { CliContext } from './config.js';
import { createCliContext } from './config.js';
import { registerEncountersCommand } from './commands/encounters/index.js';

let _ctx!: CliContext;
const getCtx = (): CliContext => _ctx;

const program = new Command()
  .name('pnpm cli')
  .description('Ulti-Project management CLI');

program.hook('preAction', () => {
  _ctx = createCliContext();
});

registerEncountersCommand(program, getCtx);

await program.parseAsync().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 6.3: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6.4: Smoke test — help output**

```bash
pnpm cli --help
```

Expected output (Commander-generated):

```
Usage: pnpm cli [options] [command]

Ulti-Project management CLI

Options:
  -h, --help  display help for command

Commands:
  encounters  Manage encounters
  help [command]  display help for command
```

- [ ] **Step 6.5: Smoke test — subcommand help**

```bash
pnpm cli encounters --help
```

Expected: lists `add`, `manage-prog-points`, `view` subcommands with descriptions.

- [ ] **Step 6.6: Smoke test — add help**

```bash
pnpm cli encounters add --help
```

Expected: shows `--config`, `--dry-run`, `--yes`, `--fflogs-encounter-id` options.

- [ ] **Step 6.7: Run lint**

```bash
pnpm biome check --fix src/cli/
```

Expected: no errors after fixes applied.

- [ ] **Step 6.8: Commit**

```bash
git add src/cli/commands/encounters/index.ts src/cli/main.ts
git commit -m "feat(cli): wire Commander routing and self-registering command factories"
```

---

## Self-Review

**Spec coverage:**
- ✅ Commander for arg parsing/help — Task 6
- ✅ Self-registering `register*(cmd, getCtx)` factories — Tasks 3–6
- ✅ `CliContext` via `preAction` hook — Task 6
- ✅ `add/` split into `index.ts` + `prompts.ts` + `steps.ts` — Task 3
- ✅ `manage-prog-points/` split into `index.ts` + `handlers.ts` — Task 4
- ✅ `view/` single file with register wrapper — Task 5
- ✅ Shared `utils/clack.ts` — Task 1
- ✅ `config.ts` with `CliContext` + `createCliContext` — Task 2

**Type consistency check:**
- `AddCommandOptions` defined in `add/index.ts`, imported by `add/prompts.ts` and `add/steps.ts` ✅
- `CliContext` defined in `config.ts`, imported by all register functions ✅
- `runAdd` exported from `add/index.ts`, called nowhere (Commander wires it directly) ✅
- `runManageProgPoints` exported for `main.ts` interim use (Tasks 4–5), then replaced by Commander wiring in Task 6 ✅
- `runView` exported similarly ✅
- After Task 6, `main.ts` only imports `createCliContext`, `registerEncountersCommand`, and Commander — all others removed ✅
