# Encounter Management Feature Plan

## Overview

This plan outlines the development stages for implementing comprehensive encounter management capabilities, building upon the recently implemented dynamic encounter management system for prog points. The goal is to enable full CRUD operations for encounters themselves, activity management, and categorization by raid-level.

## Current State Analysis

### ✅ Already Implemented

- Dynamic prog point management through Firestore
- Discord slash commands for prog point CRUD operations (`/encounters manage-prog-points`)
- Threshold-based party status logic
- Encounters collection with caching
- Basic encounter document structure

### 🔄 Partially Implemented

- Encounter viewing (read-only through `/encounters view`)
- Hardcoded encounter definitions in `encounters.consts.ts`
- Fixed encounter categories (Ultimate only, with legacy mode)

### ❌ Missing Features

- Full encounter CRUD operations via Discord
- Dynamic encounter creation/deletion
- Flexible raid-level categorization (Ultimate, Savage, Other)
- Activity status management for encounters
- Encounter metadata management (descriptions, emojis, etc.)

## Implementation Phases (Optimized Order)

## Phase 1: Analysis & Foundation (2-3 days)

### 1.1 Comprehensive Codebase Analysis

**Analysis Tasks:**

Before any changes, we need to comprehensively audit where hardcoded encounters are used:

1. **Search for all references to `Encounter` enum:**
   - `grep -r "Encounter\." src/` to find direct enum usage
   - `grep -r "encounters.consts" src/` to find imports
   - `grep -r "ENCOUNTER_CHOICES" src/` to find choice arrays
   - `grep -r "APPLICATION_MODE" src/` to find mode-based logic

2. **Document all affected components:**
   - Slash commands using encounter selection
   - Services filtering by encounter type
   - UI components displaying encounter lists
   - Configuration files and constants

**Expected affected areas:**

- **Signup Commands**: `/signup`, `/finalpush`, `/turboprog` - all use encounter selection
- **Search Commands**: Encounter filtering in search results
- **Role Management**: Encounter-specific role assignments
- **Sheets Integration**: Encounter data in Google Sheets
- **Discord Embeds**: Encounter display in messages
- **Application Mode Logic**: Mode-specific encounter filtering

### 1.2 Enhance Data Models

**Files to modify:**

- `src/firebase/models/encounter.model.ts`

**Changes:**

```typescript
export const RaidLevel = {
  ULTIMATE: 'ultimate',
  SAVAGE: 'savage',
  LEGACY: 'legacy',
  OTHER: 'other'
} as const;

export type RaidLevel = typeof RaidLevel[keyof typeof RaidLevel];

export interface EncounterDocument extends DocumentData {
  id: string; // Unique identifier (e.g., 'FRU', 'M4S', 'EX1')
  name: string; // Display name
  description: string;
  active: boolean;
  raidLevel: RaidLevel;
  emoji?: string; // Discord emoji ID or Unicode
  sortOrder: number; // For UI ordering
  progPartyThreshold?: string;
  clearPartyThreshold?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 1.3 Create Compatibility Layer

**Files to create:**

- `src/encounters/encounters-compatibility.service.ts`

**Purpose:**

Create a service that provides the same interface as the current hardcoded system during transition:

```typescript
// Backwards compatibility methods
getEncounterChoicesForMode(mode: ApplicationModeConfig): Promise<EncounterChoice[]>
getEncounterEmoji(encounterId: string): Promise<string>
getEncounterFriendlyDescription(encounterId: string): Promise<string>
getActiveEncounters(): Promise<EncounterDocument[]>
```

## Phase 2: Data Layer Implementation (2-3 days)

### 2.1 Extend Encounters Collection

**Files to modify:**

- `src/firebase/collections/encounters-collection.ts`

**New methods needed:**

- `getAllEncounters(raidLevel?: RaidLevel): Promise<EncounterDocument[]>`
- `createEncounter(encounter: Omit<EncounterDocument, 'createdAt' | 'updatedAt'>): Promise<void>`
- `updateEncounter(encounterId: string, updates: Partial<EncounterDocument>): Promise<void>`
- `deleteEncounter(encounterId: string): Promise<void>`
- `setEncounterActive(encounterId: string, active: boolean): Promise<void>`
- `reorderEncounters(encounterIds: string[]): Promise<void>`

### 2.2 Expand Encounters Service

**Files to modify:**

- `src/encounters/encounters.service.ts`

**New methods needed:**

- `getAllEncounters(raidLevel?: RaidLevel): Promise<EncounterDocument[]>`
- `createEncounter(encounterData: CreateEncounterDto): Promise<void>`
- `updateEncounter(encounterId: string, updates: UpdateEncounterDto): Promise<void>`
- `deleteEncounter(encounterId: string): Promise<void>`
- `toggleEncounterActive(encounterId: string): Promise<void>`
- `getActiveEncounters(raidLevel?: RaidLevel): Promise<EncounterDocument[]>`

### 2.3 Create Migration Scripts

**New files to create:**

- `scripts/migrate-encounters.ts`
- `scripts/validate-migration.ts`

**Migration tasks:**

1. Convert hardcoded encounters from `encounters.consts.ts` to Firestore documents
2. Assign appropriate raid levels to existing encounters
3. Set default sort orders based on current `ENCOUNTER_CHOICES` order
4. Preserve existing prog points and thresholds
5. Migrate emoji mappings to encounter documents
6. Map current application mode to encounter active status

## Phase 3: Data Migration & Compatibility (1 day)

### 3.1 Execute Data Migration

**Tasks:**

1. **Backup existing data** (prog points, thresholds)
2. **Run migration script** to populate Firestore
3. **Validate data integrity** using validation script
4. **Test compatibility layer** with existing functionality

### 3.2 Update Compatibility Layer

**Tasks:**

1. **Wire up compatibility service** to new data layer
2. **Test all existing functionality** works unchanged
3. **Verify application mode logic** still functions
4. **Ensure backward compatibility** for all existing features

## Phase 4: Discord Command Interface (3-4 days)

### 4.1 Enhance Encounters Slash Command

**Files to modify:**

- `src/slash-commands/encounters/encounters.slash-command.ts`

**New subcommands:**

```typescript
export const CreateEncounterSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Create a new encounter')
  .addStringOption(option => option.setName('id').setDescription('Unique ID (e.g., FRU, M4S)').setRequired(true))
  .addStringOption(option => option.setName('name').setDescription('Display name').setRequired(true))
  .addStringOption(option => option.setName('raid-level').setDescription('Raid difficulty level').setRequired(true)
    .addChoices(
      { name: 'Ultimate', value: 'ultimate' },
      { name: 'Savage', value: 'savage' },
      { name: 'Other', value: 'other' }
    ))
  .addStringOption(option => option.setName('description').setDescription('Encounter description').setRequired(false))
  .addStringOption(option => option.setName('emoji').setDescription('Discord emoji ID or Unicode').setRequired(false));
```

### 4.2 Create Command Handlers

**New files to create:**

- `src/slash-commands/encounters/commands/handlers/create-encounter.command-handler.ts`
- `src/slash-commands/encounters/commands/handlers/edit-encounter.command-handler.ts`
- `src/slash-commands/encounters/commands/handlers/delete-encounter.command-handler.ts`
- `src/slash-commands/encounters/commands/handlers/toggle-active.command-handler.ts`
- `src/slash-commands/encounters/commands/handlers/list-encounters.command-handler.ts`

### 4.3 Implement Smart Dropdown for Dynamic Encounters

**Files to modify:**

- `src/slash-commands/encounters/encounters.module.ts`

**Implementation Details:**

Since we expect only 4-7 active encounters at any time, the autocomplete will function as a **smart dropdown** that:

- Shows all available encounters immediately when user clicks the option (no typing required)
- Allows optional typing to filter encounters if desired
- Displays user-friendly format: "Encounter Name (ID)"
- Provides context-aware filtering (e.g., only deletable encounters for delete command)
- Supports both active and inactive encounters based on command context

## Phase 5: Service Migration & Application Mode Deprecation (2-3 days)

### 5.1 Update Dependent Services (One by One)

**Files requiring updates:**

**Slash Commands:**

- `src/slash-commands/signup/signup.service.ts`
- `src/slash-commands/finalpush/final-push-signup.slash-command.ts`
- `src/slash-commands/turboprog/turbo-prog-signup.slash-command.ts`
- `src/slash-commands/search/search.command-handler.ts`

**Core Services:**

- `src/app.service.ts` (if using encounter filtering)
- `src/sheets/sheets.service.ts` (Google Sheets integration)
- `src/discord/discord.service.ts` (if using encounter embeds)

**Components & Utilities:**

- `src/encounters/encounters.components.ts`
- `src/common/embed-helpers.ts` (if creating encounter-specific embeds)

### 5.2 Application Mode Deprecation Strategy

**Current State:**

The application mode system (`APPLICATION_MODE` environment variable) currently controls which encounters are available:

- `ultimate`: Shows current ultimate encounters (e.g., FRU)
- `legacy`: Shows older ultimate encounters (e.g., TOP, DSR, TEA, UWU, UCOB)
- `savage`: Currently unused but reserved for savage encounters

**Deprecation Steps:**

1. **Phase 5a: Dual System Support**
   - Support both APPLICATION_MODE and active flags
   - Default to active flags, fall back to mode if needed
   - Add deprecation warnings in logs

2. **Phase 5b: Mode-to-Active Migration**
   - Add admin command to migrate from mode to active flags
   - Update documentation to recommend active flag usage
   - Provide clear migration path

3. **Phase 5c: Mode Logic Removal**
   - Remove APPLICATION_MODE from config requirements
   - Clean up mode-specific code
   - Update deployment configurations

## Phase 6: Cleanup & Polish (2-3 days)

### 6.1 Remove Legacy Code

**Tasks:**

- Remove hardcoded encounter constants from `encounters.consts.ts`
- Remove compatibility layer
- Clean up unused imports and references
- Remove APPLICATION_MODE environment variable requirement

### 6.2 Advanced Features

**Features:**

- Enhanced validation and error handling
- Bulk operations (activate/deactivate multiple encounters)
- Rich embed displays for encounter lists
- Import/export functionality

### 6.3 Testing & Documentation

**Tasks:**

- Comprehensive integration tests
- Update README and documentation
- Create user guide for new encounter management
- Performance optimization and caching improvements

## Phase 7: Monitoring & Validation (1 day)

### 7.1 Production Validation

**Tasks:**

- Monitor system performance after deployment
- Validate all existing functionality works
- Ensure no regression in user experience
- Document any issues and create hotfix plan

## Implementation Priority & Dependencies

### Critical Path (Must Complete in Order)

1. **Phase 1**: Analysis & Foundation (2-3 days)
   - Complete codebase analysis before any changes
   - Establish data models and compatibility layer
   - Essential for understanding scope and dependencies

2. **Phase 2**: Data Layer Implementation (2-3 days)  
   - Build the database layer first
   - Create migration scripts
   - Foundation for all subsequent phases

3. **Phase 3**: Data Migration & Compatibility (1 day)
   - Execute migration to populate database
   - Validate data integrity
   - Ensure existing functionality remains intact

4. **Phase 4**: Discord Command Interface (3-4 days)
   - Build new management commands
   - Implement smart dropdown functionality
   - Enable encounter administration via Discord

5. **Phase 5**: Service Migration & Application Mode Deprecation (2-3 days)
   - Update all dependent services one by one
   - Gradually deprecate application mode system
   - Maintain backward compatibility throughout

### Optional/Parallel Work

1. **Phase 6**: Cleanup & Polish (2-3 days)
   - Remove legacy code and compatibility layers
   - Advanced features and UI improvements
   - Can be done in parallel with Phase 5

2. **Phase 7**: Monitoring & Validation (1 day)
   - Post-deployment validation
   - Performance monitoring
   - Documentation updates

## Risk Assessment & Mitigation

### Technical Risks

1. **Data Migration Complexity**
   - *Risk*: Existing encounters have complex prog point configurations
   - *Mitigation*: Phase 1 analysis identifies all dependencies; comprehensive validation scripts

2. **Breaking Changes During Migration**
   - *Risk*: Service updates could break existing functionality
   - *Mitigation*: Compatibility layer maintains existing interfaces; phased service updates

3. **Application Mode Deprecation Impact**
   - *Risk*: Removing APPLICATION_MODE could break deployment pipelines
   - *Mitigation*: Gradual deprecation with dual system support; clear migration documentation

### Process Risks

1. **Dependency Chain Disruption**
   - *Risk*: Starting later phases before completing prerequisites
   - *Mitigation*: Clear phase dependencies; validation checkpoints between phases

2. **Incomplete Codebase Analysis**
   - *Risk*: Missing hardcoded encounter references
   - *Mitigation*: Comprehensive grep analysis in Phase 1; validation testing in Phase 3

## Success Metrics

1. **Phase Completion**: Each phase meets its validation criteria before proceeding
2. **Zero Regression**: All existing functionality works after each phase
3. **Performance**: Command response times remain < 3 seconds
4. **Data Integrity**: No loss of prog points, thresholds, or user data
5. **Admin Adoption**: Admin team successfully uses new encounter management features

## Optimized Timeline

**Total Estimated Development Time**: 13-19 days (vs. previous 12-17 days)  
**Critical Path Duration**: 10-14 days  
**Parallel Work Opportunity**: 3-5 days  
**Recommended Team Size**: 1-2 developers  
**Target Completion**: 2-3 weeks with proper validation at each phase

## Future Enhancements (Out of Scope)

- Web dashboard for encounter management
- Encounter templates and sharing between Discord servers
- Advanced analytics and reporting
- Integration with external raid tracking tools
- Automated encounter discovery from game data APIs

## Questions for Discussion ✅ RESOLVED

1. **Raid Level Categories**: ✅ **"Ultimate", "Savage", and "Other" are sufficient**
2. **Encounter IDs**: ✅ **No strict naming convention required (UCoB, FRU, etc. are fine as-is)**
3. **Migration Timeline**: ✅ **Single large commit with all phases complete**
4. **Permission Model**: ✅ **Encounter management restricted to administrators only**
5. **Soft vs Hard Delete**: ✅ **Hard delete - encounter deletion is permanent**

## Implementation Notes

### Permission Model

- All `/encounters` subcommands will require `Administrator` permissions
- Uses existing `setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` pattern

### Encounter ID Validation

- No strict character limits or patterns enforced
- Allow existing format: UCoB, FRU, TOP, DSR, TEA, UWU, M4S, etc.
- Validate uniqueness only

### Deletion Behavior

- Hard delete encounters from database
- Add confirmation dialog: "Are you sure you want to permanently delete [Encounter Name]?"
- Prevent deletion if encounter has active signups or prog points

---

**Total Estimated Development Time**: 13-19 days  
**Implementation Approach**: Single comprehensive commit with all phases  
**Recommended Team Size**: 1 AI agent + 1 developer for review  
**Target Completion**: All phases completed as one cohesive implementation
