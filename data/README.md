# Encounter Data

This directory contains YAML configurations for raid encounters that are synced to Firestore.

## Workflow

### 1. Update YAML Files

Edit the YAML files in the `encounters/` directory to update encounter progression points. Each file follows the JSON schema defined in `encounter.schema.yaml`.

Example fields:
- `id`: Unique identifier (uppercase letters and underscores only)
- `name`: Display name for the encounter
- `description`: Encounter description
- `active`: Whether this encounter is currently active
- `progPoints`: Array of progression milestones, each with:
  - `id`: Unique ID for the progression point
  - `label`: Display label (e.g., "Phase 2: Adds")
  - `partyStatus`: Party status category (Early Prog Party | Prog Party | Clear Party | Cleared)
  - `active`: Whether this prog point is currently tracked
- `progPartyThreshold`: Which progression point defines a "prog party"
- `clearPartyThreshold`: Which progression point defines a "clear party"

### 2. Validate & Sync to Firestore

Run the CLI command to push your changes to Firestore:

```bash
# Sync all encounters
pnpm cli encounters push

# Sync a specific encounter
pnpm cli encounters push FRU

# Dry-run to preview changes
pnpm cli encounters push --dry-run

# Skip confirmation prompts
pnpm cli encounters push --yes
```

The CLI will:
- Load and validate all YAML files against `encounter.schema.yaml`
- Prompt for confirmation before syncing each encounter
- Clear existing progression points and re-add them from the YAML
- Display a summary of changes made

## Schema Validation

YAML files are validated using the JSON schema in `encounter.schema.yaml`. Your editor can provide real-time validation by including this header:

```yaml
# yaml-language-server: $schema=./encounter.schema.yaml
```

This is automatically added when using the CLI to create new encounters.

## Notes

- Always sync changes via the CLI after editing YAML files—the database will not automatically reflect file changes
- The `progPoints` order in the YAML determines their display order in the application
- Removing a progression point from the YAML and syncing will delete it from Firestore
