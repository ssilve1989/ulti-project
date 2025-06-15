# Database Seeding Guide

## Overview

This document explains how to seed the Firestore database with realistic sample data for testing the scheduling API functionality. The seeding system creates:

- **6 Helpers** with diverse job capabilities and weekly availability schedules
- **10 Proggers** (approved signups) across different encounters and prog points
- **9 Sample Events** with various statuses (draft, published, in-progress, completed, cancelled)
- **Helper Absences** for testing availability conflicts
- **Realistic Roster Data** including partially and fully filled events

## Quick Start

### Option 1: Automatic Seeding (Recommended)

The seeding happens automatically when the Discord bot starts up:

```bash
cd apps/discord-bot
pnpm dev
```

The `DatabaseSeederService` implements `OnApplicationBootstrap` and will automatically seed the database on startup if no existing data is found.

### Option 2: Manual Seeding Script

Run the seeding script manually:

```bash
cd apps/discord-bot

# Seed with sample data (skips if data exists)
pnpm seed-db

# Force reseed (would delete existing data first - not implemented yet)
pnpm seed-db:force
```

## Sample Data Overview

### Guild Configuration

- **Guild ID**: `913492538516717578` (SAUSFEST)
- **Multi-tenant**: All data is properly isolated by guild ID

### Helpers Created (6 total)

| Helper | Discord ID | Primary Jobs | Availability |
|--------|------------|--------------|--------------|
| **TankMaster** | 100000000001 | PLD, WAR, DRK, GNB | Mon/Tue/Fri/Sat evenings |
| **HealBot** | 100000000002 | WHM, SCH, AST, SGE | Tue/Wed/Thu/Sun evenings |
| **DPSGod** | 100000000003 | BLM, SMN, RDM, DRG, NIN | Mon/Wed/Fri/Sat evenings |
| **FlexPlayer** | 100000000004 | GNB, SGE, RPR, DNC | Tue/Thu/Sun evenings |
| **RangedExpert** | 100000000005 | BRD, MCH, DNC | Mon/Wed/Fri evenings |
| **MeleeMain** | 100000000006 | MNK, DRG, NIN, SAM, RPR | Tue/Thu/Sat evenings |

### Proggers Created (10 total)

| Username | Character | Encounter | Prog Point | Party Status |
|----------|-----------|-----------|------------|--------------|
| **KatelynFF** | Katelyn Arashi | FRU | P2 Light Rampant | Prog Party |
| **ThunderMage** | Lightning Strike | FRU | P3 Transitions | Prog Party |
| **WarriorOfLight** | Sword Saint | FRU | P2 Light Rampant | Prog Party |
| **HolyPriest** | Divine Healer | FRU | P1 Burnished Glory | Early Prog |
| **NinjaMaster** | Shadow Blade | TOP | P3 Hello World | Prog Party |
| **BardSong** | Ranged Slayer | TOP | P2 Pantokrator | Prog Party |
| **DarkTank** | Dark Destroyer | DSR | P5 Death of Heavens | Prog Party |
| **StarReader** | Astro Guide | DSR | P3 Nidhogg | Prog Party |
| **RedMageProud** | Spell Weaver | TEA | Perfect Alexander | Cleared |
| **MonkFist** | Earth Shaker | UCOB | Golden Bahamut | Cleared |

### Events Created (9 total)

| Event Name | Encounter | Status | Scheduled | Roster Status |
|------------|-----------|--------|-----------|---------------|
| **FRU Weekly Prog - P2 Light Rampant** | FRU | Published | +2 days | Empty |
| **FRU Clear Party - P3 Diamond Dust** | FRU | Published | +5 days | Partially Filled |
| **FRU Learning Party - P1 Burnished Glory** | FRU | Draft | +1 day | Empty |
| **TOP Reclear - All Phases** | TOP | Published | +7 days | Empty |
| **TOP P3 Hello World Practice** | TOP | Published | +4 days | Empty |
| **DSR Learning Party - P1-P3** | DSR | Draft | +3 days | Empty |
| **TEA Farm Session - Weekly Clear** | TEA | Completed | -2 days | Fully Filled |
| **UCOB Practice - Cancelled** | UCOB | Cancelled | +1 day | Empty |
| **FRU Marathon Session - Live!** | FRU | In Progress | -1 hour | Fully Filled |

### Helper Absences Created (2 total)

| Helper | Period | Reason |
|--------|--------|--------|
| **TankMaster** | +2 to +3 weeks | Vacation - Going to Japan |
| **DPSGod** | +1 to +1.5 weeks | Work conference |

## Data Validation

After seeding, you can verify the data was created correctly:

### Check Events

```bash
curl "http://localhost:3000/api/events?guildId=913492538516717578"
```

### Check Helpers

```bash
curl "http://localhost:3000/api/helpers?guildId=913492538516717578"
```

### Check Participants (Proggers + Helpers)

```bash
curl "http://localhost:3000/api/participants?guildId=913492538516717578"
```

## Testing Scenarios

The seeded data supports testing these key scenarios:

### 1. **Draft Lock System**

- Multiple team leaders can test locking/unlocking participants
- 30-minute lock expiration can be tested
- Conflict resolution when multiple leaders want same participant

### 2. **Roster Building**

- **Empty events** for testing full roster building
- **Partially filled events** for testing roster modifications
- **Fully filled events** for testing roster viewing

### 3. **Helper Availability**

- **Weekly schedules** with realistic time ranges and timezones
- **Absence periods** that create scheduling conflicts
- **Multi-job helpers** for testing job selection

### 4. **Event Lifecycle**

- **Draft events** for testing publishing workflow
- **Published events** for testing roster assignments
- **In-progress events** for testing live event management
- **Completed/cancelled events** for testing historical data

### 5. **Real-time Updates**

- Multiple participants for testing SSE streams
- Various event states for testing event updates
- Draft locks for testing real-time collaboration

## Development Workflow

1. **Start with Fresh Database**: Run the bot to automatically seed data
2. **Test Frontend Features**: Use the seeded data to test scheduling UI
3. **Test API Endpoints**: Verify all CRUD operations work correctly
4. **Test Real-time Features**: Multiple browser tabs to test SSE streams
5. **Test Edge Cases**: Use absence periods and conflicts for error handling

## Customization

To modify the sample data:

1. **Edit Helper Data**: Update `seedHelpers()` method in `DatabaseSeederService`
2. **Edit Progger Data**: Update `seedProggers()` method for different encounters/prog points
3. **Edit Event Data**: Update `seedEvents()` method for different scenarios
4. **Add More Data**: Create additional helpers, proggers, or events as needed

## Troubleshooting

### Seeding Doesn't Run

- Check that no existing events or helpers exist in the database
- The seeder skips if any data is found to avoid duplicates

### Import Errors

- Ensure all Firebase collections are properly exported
- Check that the shared package types are correctly imported

### Data Not Appearing

- Verify the guild ID matches your test environment: `913492538516717578`
- Check Firestore console to confirm data was written
- Ensure proper guild-based data isolation

## Next Steps

After seeding:

1. **Switch Frontend to Real API**: Update `USE_MOCK_DATA = false` in `schedulingApi.ts`
2. **Test All Features**: Verify event creation, roster management, draft locks work
3. **Test Real-time Updates**: Confirm SSE streams work with real Firestore listeners
4. **Performance Testing**: Test with realistic data volumes

The seeded data provides a solid foundation for comprehensive testing of the scheduling system!
