# Encounter Management

## Overview

Encounters are the FFXIV content (ultimates, savages) that the bot manages signups for. Each encounter has a Firestore document, a set of prog points, and a corresponding entry in the hardcoded `Encounter` enum. This document describes how that system has evolved and where it could go.

---

## Before the CLI (original state)

### Source of truth: the code

Encounter identity lives entirely in TypeScript source files:

- **`src/encounters/encounters.consts.ts`** — the `Encounter` enum, `ENCOUNTER_CHOICES` array, `EncounterEmoji` map, `EncounterFriendlyDescription` map
- Adding a new encounter requires a code change, a deployment, and manual Discord command re-registration

### Firestore: runtime data only

Firestore stores per-encounter data that the code doesn't know at compile time:

| Collection | Fields |
|---|---|
| `encounters/{id}` | `name`, `description`, `active`, `progPartyThreshold?`, `clearPartyThreshold?` |
| `encounters/{id}/progPoints/{id}` | `id`, `label`, `partyStatus`, `order`, `active` |

Encounter documents must be seeded manually or via the Discord `/encounters` admin command. There was no bulk export/import mechanism.

### Discord admin commands (`/encounters`)

Available to admins in-server:

| Subcommand | What it does |
|---|---|
| `set-thresholds` | Set `progPartyThreshold` / `clearPartyThreshold` |
| `manage-prog-points` | Add, edit, reorder, toggle, or delete prog points |
| `view` | Display encounter config |

Choices in these commands are driven by the hardcoded `Encounter` enum — adding a new encounter to the dropdown requires a code change.

### Problems with this approach

- **Tight coupling**: encounter identity (emoji, FFLogs IDs, mode) lives in TypeScript constants scattered across the codebase
- **No bulk management**: adding/editing multiple prog points means many round-trips through Discord modals
- **No portability**: no way to export encounter state, back it up, or replicate it to another bot instance
- **Deployment required**: adding a new encounter to the slash command choices requires a code push

---

## With the CLI (`feat/cli-encounter-management`)

### New: `pnpm cli` — a local admin tool

A self-contained Bun CLI (`src/cli/`) that connects directly to Firestore using the same GCP credentials as the bot. Runs locally, no deployment required.

```
src/cli/
├── main.ts                    # Commander root + preAction ctx init
├── config.ts                  # CliContext, ctx singleton
├── commands/encounters/
│   ├── add/                   # Interactive wizard or --config <yaml>
│   ├── manage-prog-points/    # Manage individual prog points
│   ├── pull/                  # Firestore → data/encounters/*.yaml
│   ├── push/                  # data/encounters/*.yaml → Firestore
│   └── view/                  # Read-only Firestore dump
└── utils/
    ├── encounter-yaml.ts      # EncounterYamlConfig schema + read/write
    └── firestore.ts           # Direct Firestore helpers
```

### New commands: `encounters pull` / `encounters push`

The pull/push pair treats `data/encounters/*.yaml` as a portable representation of Firestore encounter state.

**`pnpm cli encounters pull`**
- Reads all active encounters from Firestore (plus their prog points)
- Writes one YAML file per encounter to `data/encounters/{ID}.yaml`
- `order` is omitted from YAML — it is derived from array position on push

**`pnpm cli encounters push [--dry-run] [--yes] [encounter-id]`**
- Reads and validates YAML files against the `EncounterYamlConfig` schema
- For each encounter: upserts the Firestore document, clears all existing prog points, re-seeds from the YAML array in order
- `--dry-run` validates and prints what would change, no writes
- `--yes` skips per-encounter confirmation prompts

### YAML format

```yaml
id: FRU
name: Futures Rewritten (Ultimate)
description: '[FRU] Futures Rewritten'
mode: ultimate
active: true
emoji: '1314628063782506506'
fflogsEncounterIds:
  - 1002
progPartyThreshold: P2_TRANSITION
clearPartyThreshold: ENRAGE
progPoints:
  - id: P1_ADDS
    label: Phase 1 Adds
    partyStatus: prog
    active: true
  - id: P2_TRANSITION
    label: Phase 2 Transition
    partyStatus: prog
    active: true
  - id: ENRAGE
    label: Enrage
    partyStatus: clear
    active: true
```

### What this unlocks

- **Version-controlled encounter config** — YAML files can be committed to the repo, giving a history of encounter changes
- **Bulk editing** — edit multiple prog points in a text editor, then push in one command
- **Backup and restore** — pull before making changes; revert by editing and pushing
- **New instance bootstrap** — push a full directory of YAML files to seed a fresh Firestore
- **Dry-run safety** — validate changes before committing them to Firestore

### What still requires a code change

- Adding an encounter to the `Encounter` enum (for Discord slash command choices)
- Adding emoji, FFLogs encounter IDs, and mode to `encounters.consts.ts`
- Re-registering slash commands after adding a new encounter

The YAML files can store `mode`, `emoji`, `fflogsEncounterIds` — but those fields are not yet wired back into the bot's source constants. The code and Firestore are still two separate sources of truth.

---

## Future: Dynamic Encounters (`ai-docs/architecture/dynamic-encounters.md`)

### The problem this solves

Currently, the `Encounter` enum in code and the Firestore documents are managed independently. Adding a new encounter requires both a Firestore write (via CLI/Discord) and a source code change (enum + constants + re-registration). These can drift.

### Proposed architecture

**Principle: enum defines what _can_ exist; Firestore controls what _is_ active.**

Keep the `Encounter` enum as the compile-time contract for all possible encounters. Add an `EncounterService.getActiveEncounters()` method that filters the enum against Firestore's `active` flags at runtime.

```typescript
// Enum remains the authoritative list
enum Encounter { TOP, UWU, UCOB, TEA, DSR, FRU }

// Runtime filtering via Firestore
async getActiveEncounters(): Promise<Encounter[]> {
  const active = await firestoreEncounters.getActiveEncounters();
  const activeIds = new Set(active.map(e => e.id));
  return Object.values(Encounter).filter(e => activeIds.has(e));
}
```

### Four implementation phases

**Phase 1 — Service enhancement**
- `getActiveEncounters()` and `getActiveEncounterChoices()` on `EncountersService`
- Startup validation to warn when enum and Firestore are out of sync

**Phase 2 — Schema updates**
- Zod validation on `/signup` checks encounter is both in enum AND active in Firestore
- Replaces the current static enum check

**Phase 3 — Dynamic slash command registration**
- Slash command choices are built from `getActiveEncounterChoices()` at startup
- Commands re-registered when encounter active state changes (toggle via Discord or CLI)
- Inactive encounters disappear from the `/signup` dropdown without a deployment

**Phase 4 — Startup consistency checks**
- `EncounterValidationService` warns at boot if any enum values lack a Firestore document, or vice versa
- Catches drift between code and data early

### How the CLI fits in

With dynamic encounters, the `pull`/`push` workflow becomes the primary way to manage encounter state:

1. Edit `data/encounters/FRU.yaml` — adjust prog points, flip `active: true/false`
2. `pnpm cli encounters push FRU` — write to Firestore
3. Bot detects the change (or on next restart) and re-registers slash commands with updated choices

The `Encounter` enum would still gate what IDs the bot recognises, but the YAML files become the operational config. The gap between "code knows about it" and "bot shows it in Discord" collapses to a single push.

### What would still require a code change

With the full dynamic encounters implementation, only adding a **brand new** encounter to the enum would need a code change. Activating, deactivating, and tuning existing encounters (prog points, thresholds, metadata) would be entirely CLI/YAML driven.
