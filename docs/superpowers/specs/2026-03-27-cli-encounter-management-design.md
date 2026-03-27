# CLI Encounter Management — Design Spec

**Date:** 2026-03-27
**Status:** Approved

---

## Overview

A developer-facing CLI tool (`pnpm cli`) for managing FFXIV Ultimate encounters in the ulti-project Discord bot. The CLI handles the full lifecycle of adding and maintaining encounters: editing TypeScript source constants, seeding Firestore, and looking up FF Logs encounter IDs — all from the terminal with a polished interactive experience.

---

## Background

Encounters currently have two layers of state:

1. **Static code** (`src/encounters/encounters.consts.ts`, `src/fflogs/fflogs.consts.ts`) — the `Encounter` enum, display names, emoji IDs, slash command choices, application mode tags, and FF Logs encounter IDs.
2. **Firestore** (`encounters` collection + `prog-points` subcollection) — the encounter document (`name`, `description`, `active`, `progPartyThreshold`, `clearPartyThreshold`) and each prog point (`id`, `label`, `partyStatus`, `order`, `active`).

Adding a new encounter currently requires manually editing two source files and then using the Discord `/encounters` slash command to seed Firestore — or writing ad-hoc scripts. The CLI automates this entirely.

---

## Architecture

### File structure

```
src/
  firebase/
    create-firestore.ts        # NEW: pure factory fn — createFirestore(config) → Firestore
    firebase.module.ts         # Updated: useFactory calls createFirestore() instead of inlining

  cli/
    main.ts                    # Entry point — routes top-level commands
    commands/
      encounters/
        add.ts                 # Add new encounter (interactive + config file)
        manage-prog-points.ts  # Add/edit/remove/reorder/toggle prog points
        view.ts                # Read-only Firestore inspection
    utils/
      firestore.ts             # Raw Firestore CRUD for encounters + prog-points (no NestJS DI)
      source-editor.ts         # In-place edits to encounters.consts.ts + fflogs.consts.ts
      fflogs-lookup.ts         # FF Logs GraphQL search for encounter IDs
      config-loader.ts         # Load + zod-validate YAML/JSON config files
```

### Key design decisions

- **No NestJS** — the CLI bootstraps its own Firebase connection via `createFirestore()`. NestJS startup overhead (~1–2s) is avoided, and the Discord bot's dependency graph (Discord.js, Sentry, etc.) is not loaded.
- **Shared types, not shared services** — the CLI imports `EncounterDocument`, `ProgPointDocument`, `PartyStatus`, and `Encounter` from `src/` directly. It does not reuse `EncountersCollection` or `EncountersService` (which are NestJS-coupled), but writes minimal Firestore operations in `src/cli/utils/firestore.ts`.
- **Shared Firebase init** — `FirebaseModule` is refactored to call `createFirestore()` so initialisation logic is not duplicated.
- **`verbatimModuleSyntax` / `nodenext`** — all CLI files follow existing project module conventions (`.js` extensions on imports, `import type` where appropriate).

### New dependencies (devDependencies only)

| Package | Purpose |
|---|---|
| `@clack/prompts` | Terminal UI — spinners, prompts, groups, cancel handling |
| `js-yaml` | Parse YAML config files |

`firebase-admin`, `graphql-request`, `zod`, and `@dotenvx/dotenvx` are already present.

### `package.json` addition

```json
"cli": "dotenvx run -f .env -- node --experimental-strip-types src/cli/main.ts"
```

### `tsconfig.build.json`

Add `"src/cli"` to `exclude` so the CLI is not compiled into the production bot bundle.

---

## `createFirestore` factory

**`src/firebase/create-firestore.ts`**

A pure function that takes `{ clientEmail, privateKey, projectId, databaseId? }` and returns a configured `Firestore` instance. Handles `initializeApp`, `cert`, `getFirestore`, `ignoreUndefinedProperties`, and the optional `FIRESTORE_DATABASE_ID`.

`FirebaseModule` is updated to call this function in its `useFactory`, passing `appConfig` and `firebaseConfig` values. Behaviour is unchanged.

---

## Commands

### `pnpm cli encounters add`

The primary command. Supports two modes:

**Interactive** (no flags):

```
┌  Add New Encounter
│
◆  Encounter ID (short key, e.g. FRU)
◆  Full name (e.g. Futures Rewritten (Ultimate))
◆  Short description (e.g. [FRU] Futures Rewritten)
◆  Application mode  ›  legacy / ultimate
│
│  (if ultimate selected and another encounter is currently mode: ultimate)
│  ⚠ FRU is currently mode: ultimate
◆  Move FRU to legacy?  ›  yes / no (abort)
│
◆  Discord emoji ID (optional)
◆  FF Logs encounter IDs
│   ├─ Search FF Logs by name
│   ├─ Enter manually
│   └─ Skip for now
│
◆  Add prog points now?  ›  yes / no
│   └─ (if yes) loops: id, label, party status — until done
│
◆  Set prog party threshold?  (select from added prog points)
◆  Set clear party threshold?  (select from added prog points)
│
◆  Apply source file changes?  ›  yes / dry-run / no
└  Seed Firestore?  ›  yes / dry-run / no
```

**Config file** (`pnpm cli encounters add --config path/to/encounter.yaml`):

Loads and validates the YAML file, then confirms before applying (skippable with `--yes`).

**Flags:**

| Flag | Description |
|---|---|
| `--config <path>` | Load encounter definition from YAML/JSON |
| `--dry-run` | Print what would change, apply nothing |
| `--yes` | Skip confirmation prompts (use with `--config`) |
| `--fflogs-encounter-id <id>` | Override FF Logs ID lookup (comma-separated for multiple) |

---

### Config file schema (YAML)

```yaml
id: FRU_NEW                          # Required. Maps to Encounter enum key + value
name: "New Ultimate (Ultimate)"      # Required. EncounterFriendlyDescription value
description: "[NEW] New Ultimate"    # Required. Short description for display
mode: ultimate                       # Required. 'legacy' | 'ultimate' | 'savage'
emoji: "123456789"                   # Optional. Discord emoji snowflake ID
fflogsEncounterIds: [1080]           # Optional. Array of FF Logs encounter IDs

progPoints:                          # Optional. Seed Firestore prog-points subcollection
  - id: p1
    label: "Phase 1"
    partyStatus: "Early Prog Party"
  - id: cleared
    label: "Cleared"
    partyStatus: "Cleared"

progPartyThreshold: p1               # Optional. Must match a prog point id above
clearPartyThreshold: cleared         # Optional. Must match a prog point id above
```

Validated with a zod schema in `config-loader.ts`. `partyStatus` values are validated against the `PartyStatus` enum.

---

### `pnpm cli encounters manage-prog-points`

Operates on Firestore only (no source file changes).

```
◆  Select encounter  ›  (list from Encounter enum)

◆  What would you like to do?
   ├─ Add prog point
   ├─ Edit prog point  (label or partyStatus)
   ├─ Toggle active/inactive
   ├─ Delete prog point
   └─ Reorder prog points
```

Loops back to the action menu until the user exits. Mirrors the Discord `/encounters manage-prog-points` flow but runs without the bot.

Respects the same threshold-dependency guard as `EncountersService`: cannot delete or deactivate a prog point that is set as `progPartyThreshold` or `clearPartyThreshold`.

---

### `pnpm cli encounters view [encounter-id]`

Read-only. Fetches from Firestore and renders a formatted table.

**Single encounter:**

```
  FRU — Futures Rewritten (Ultimate)
  Prog threshold:  p1
  Clear threshold: cleared

  #   ID         Label         Party Status       Active
  0   p1         Phase 1       Early Prog Party   ✅
  1   cleared    Cleared       Cleared            ✅
```

**All encounters** (no ID given): summary table — name, active status, prog point count, thresholds set/unset.

---

## Source file editing

`source-editor.ts` performs targeted string manipulation (not an AST parser) on two files:

### `src/encounters/encounters.consts.ts`

| Target | Operation |
|---|---|
| `Encounter` enum | Append new `KEY = 'VALUE'` entry |
| `EncounterFriendlyDescription` | Append new `[Encounter.KEY]: 'value'` entry |
| `EncounterEmoji` | Append new `[Encounter.KEY]: 'snowflakeId'` entry (if emoji provided) |
| `ENCOUNTER_CHOICES` | Append new `{ name, value, mode }` object |
| Existing `ultimate` entry | Change `mode: 'ultimate'` → `mode: 'legacy'` (when adding a new ultimate) |

### `src/fflogs/fflogs.consts.ts`

| Target | Operation |
|---|---|
| `EncounterIds` Map | Append new `[Encounter.KEY, [id1, id2]]` entry |

**Detecting the current ultimate:** `source-editor.ts` reads `encounters.consts.ts` at runtime and parses the `ENCOUNTER_CHOICES` array using a regex to find any entry with `mode: 'ultimate'`. This is how the cascade warning is triggered. If multiple entries are found with `mode: 'ultimate'` (should not happen, but defensive), the CLI warns and aborts rather than silently proceeding.

**Before applying**, the CLI prints a minimal diff of every change and requires confirmation (unless `--yes`).

**Rationale for string manipulation over AST:** the target files are small, consistently formatted, and unlikely to change structure. Pulling in `ts-morph` (~15MB) for targeted appends is not worth the dependency cost.

---

## FF Logs lookup

**`src/cli/utils/fflogs-lookup.ts`**

Calls the FF Logs GraphQL API using `graphql-request` and `FFLOGS_API_ACCESS_TOKEN` from `.env`.

- Searches by encounter name, returns a list of `{ id, name, difficulty }` results for the user to select from
- If `FFLOGS_API_ACCESS_TOKEN` is not set, the search option is hidden and the CLI prompts for manual entry with an explanatory note
- Results are cached in-memory for the duration of the CLI session

---

## Error handling

- Every destructive action (Firestore write, source file edit) shows a preview and requires confirmation before proceeding
- `--dry-run` prints the full planned changeset and exits cleanly
- Partial Firestore writes: if the encounter document is created but prog points fail mid-way, the CLI reports exactly what was and was not written — no silent partial state. The user can re-run `manage-prog-points` to complete the seeding
- Source file edits are applied atomically per file (full file rewrite after all replacements are computed, not incremental patching)
- Clack's built-in cancel handling (`isCancel()`) is used throughout — Ctrl+C exits cleanly with a cancellation message

---

## Constraints & out of scope

- The CLI does **not** manage `APPLICATION_MODE` in `.env` — that remains a manual config change
- The CLI does **not** delete encounters or remove enum values from source (deletion is risky and rarely needed; deactivation in Firestore is sufficient)
- No test coverage required for the CLI in this iteration (it's a dev tool, not shipped code)
- `tsconfig.build.json` excludes `src/cli` from the production build
