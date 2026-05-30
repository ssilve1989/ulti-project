---
name: edit-encounter-prog-points
description: Use when adding, editing, or deleting progression points in encounter YAML files, to avoid skipping validation or forgetting the required Firestore sync step
---

# Adding/Editing Encounter Progression Points

## Overview

Encounter progression points define raid milestones in the Discord bot. They live in YAML files but must be synced to Firestore to appear in the bot.

**Core principle:** YAML is source, Firestore is destination. Changes only appear after running the sync CLI command.

## When to Use

- Adding a new progression point to an encounter
- Editing an existing prog point (rename, change status, etc.)
- Deleting prog points
- Deactivating prog points
- Reorganizing prog point order

**When NOT to use:** For viewing encounters or understanding current bot state—read the YAML or Firestore directly, don't edit.

## Workflow

```
1. Edit YAML file
   ↓
2. Validate structure against schema
   ↓
3. Check threshold references
   ↓
4. Run sync command (MANDATORY)
   ↓
5. Confirm sync successful
```

## Data Structure & Schema

Each prog point MUST have these fields:

```yaml
progPoints:
  - id: "P3: Apocalypse"           # Required: Unique within encounter, uppercase+underscores
    label: "Phase 3: Apocalypse"   # Required: Display name in Discord
    partyStatus: Prog Party         # Required: One of 4 enums (see below)
    active: true                    # Required: Boolean, controls tracking
```

### Required partyStatus Values

Must be EXACTLY one of:
- `Early Prog Party` — very early progression
- `Prog Party` — active progression milestones
- `Clear Party` — post-clear content
- `Cleared` — encounter fully defeated

**Common mistake:** Using `progParty` or `prog_party` instead of `Prog Party` with proper spacing/capitalization.

### Threshold Fields (Encounter-Level)

These reference prog point IDs by name:

```yaml
progPartyThreshold: "P3: Apocalypse"      # Minimum prog point for a "prog party"
clearPartyThreshold: "P5: Fulgent 1"      # Minimum prog point for a "clear party"
```

⚠️ **When editing a prog point ID**, check if `progPartyThreshold` or `clearPartyThreshold` reference it. If renamed, update thresholds too.

## Editing Checklist

### Before Editing
- [ ] Have you read the current YAML file for the encounter?
- [ ] Do you understand if this changes thresholds (see Threshold Fields above)?

### While Editing
- [ ] Prog point has all 4 required fields: id, label, partyStatus, active
- [ ] `id` matches pattern: `[A-Z0-9_]+` (uppercase letters, numbers, underscores only)
- [ ] `partyStatus` is EXACTLY one of the 4 enums (check capitalization/spacing)
- [ ] `id` is unique within the encounter (no duplicates)
- [ ] Order in the array matters — reorder if needed
- [ ] If renaming an `id`: update `progPartyThreshold` or `clearPartyThreshold` if they reference it

### After Editing
- [ ] **MANDATORY: Run the sync command** (see Sync Commands below)
- [ ] Confirm the CLI output shows correct encounter name and prog point count

## Sync Commands

**After editing the YAML file, you MUST run one of these:**

```bash
# Sync a specific encounter (recommended)
pnpm cli encounters push FRU

# Sync all encounters (use cautiously)
pnpm cli encounters push

# Preview changes without syncing (dry-run)
pnpm cli encounters push --dry-run

# Skip confirmation prompts (useful for automation)
pnpm cli encounters push FRU --yes
```

**What the sync does:**
1. Validates YAML against schema
2. Clears old prog points from Firestore
3. Writes all prog points from YAML to Firestore
4. Discord bot reads from Firestore (NOT from YAML)

**Success output:** `Pushed FRU (18 prog points)`

If this doesn't appear, the sync failed and changes are **not in Firestore**.

### If Sync Validation Fails

The CLI will report errors like:
```
Invalid encounter YAML:
  • progPoints.0.partyStatus: "invalid value"
  • progPoints.1.id: "must be uppercase letters and underscores only"
```

**What this means:** Your YAML has an error. Do NOT skip the sync and hope it works—fix the error and retry.

**Common validation errors:**
- `partyStatus: "invalid value"` → Check you used exact enum: `Early Prog Party`, `Prog Party`, `Clear Party`, or `Cleared`
- `id: "must be uppercase..."` → Rename id to use only uppercase letters, numbers, underscores (e.g., `P3_APOCALYPSE` not `p3-apocalypse`)
- `required field missing` → Check prog point has id, label, partyStatus, active
- `threshold references undefined prog point` → If progPartyThreshold or clearPartyThreshold reference a non-existent id, add the prog point or update the threshold

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|---------------|-----|
| Edit YAML, don't run sync | Changes never reach Firestore; bot shows old data | Always run `pnpm cli encounters push ENCOUNTER_ID` |
| Use `Prog Party` in code but `progParty` in YAML | Schema validation fails, sync rejects file | Use exact enum: `Prog Party` with space and capitals |
| Rename prog point id but forget threshold update | Thresholds reference broken id | If `progPartyThreshold: "P3: Old Name"` and you rename it, update the threshold field too |
| Delete prog point without checking thresholds | Thresholds may reference deleted id; bot breaks silently | Before deleting, check if `progPartyThreshold` or `clearPartyThreshold` reference it; update thresholds first |
| Copy-paste prog point with duplicate id | Schema validation fails (id must be unique) | Change id to something unique within encounter |
| Assume YAML changes auto-reflect in bot | They don't—bot reads Firestore | Sync is mandatory step, not optional |
| Don't check enum values for partyStatus | Invalid enum causes sync failure | Check against 4 valid values (Early Prog Party, Prog Party, Clear Party, Cleared) |

## Example: Adding a New Prog Point

```yaml
# FRU.yaml
id: FRU
name: "[FRU] Futures Rewritten"
progPartyThreshold: "P3: Apocalypse"
clearPartyThreshold: "P5: Fulgent 1"
progPoints:
  - id: "P3: Apocalypse"
    label: "Phase 3: Apocalypse"
    partyStatus: Prog Party
    active: true
  
  # NEW: Adding this prog point
  - id: "P4: Adds"
    label: "Phase 4: Adds"
    partyStatus: Prog Party
    active: true
```

Then sync:
```bash
pnpm cli encounters push FRU
```

Output: `Pushed FRU (N prog points)` where N includes your new point.

## Example: Renaming with Threshold Update

Renaming `P3: Enrage` → `P3: Curtain Call`:

```yaml
# Update the prog point
progPoints:
  - id: "P3: Curtain Call"           # Changed id
    label: "Phase 3: Curtain Call"   # Changed label
    partyStatus: Prog Party
    active: true

# If threshold referenced the old id, update it too
progPartyThreshold: "P3: Curtain Call"  # Updated to match new id
```

Then sync:
```bash
pnpm cli encounters push FRU
```

## Red Flags - Stop and Validate

These signal you're about to make a mistake:

- **"I'll just edit YAML and it will show up"** → You MUST sync
- **"PartyStatus should be `progParty`"** → Use `Prog Party` with exact capitalization
- **"I renamed the id but thresholds don't need updating"** → Check if thresholds reference it
- **"YAML looks valid to me"** → Run sync; let the schema validator decide
- **"I'm tired, just ship it"** → Forgetting sync is the #1 failure mode under exhaustion
- **"Validation is overkill"** → Schema catches typos that break the bot silently

## Workflow Decision Tree

```
Is this about adding/editing a prog point?
├─ YES: Proceed with this skill
└─ NO: Use different reference

Am I certain I know the prog point's id, label, status?
├─ NO: Read the YAML file first
└─ YES: Continue

Does the edit change any prog point ids?
├─ YES: Check progPartyThreshold and clearPartyThreshold
├─ NO: Continue
└─ If thresholds reference it: Update them too

Have I made the YAML changes?
├─ NO: Make them now
└─ YES: Continue

Am I about to run pnpm cli encounters push?
├─ NO: Stop. This step is mandatory.
└─ YES: Do it now, observe the output
```

## Why This Matters

The sync step is not optional because:
1. **Discord bot reads Firestore, not YAML** — YAML is source-of-truth for data, but bot needs live data in Firestore
2. **Schema validation catches typos** — Invalid enum values or missing fields fail silently without sync
3. **Ordering is preserved** — Prog point order in Discord comes from Firestore document order
4. **Thresholds must exist** — Bot queries thresholds at runtime; broken references cause crashes

Skipping sync is the #1 cause of "I made a change but the bot doesn't show it" bugs.
