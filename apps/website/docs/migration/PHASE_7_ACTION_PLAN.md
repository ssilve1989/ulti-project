# Phase 7: Action Plan Summary

## 🎯 Goal
Replace all imports from `schedulingApi.js` with the new API system to enable environment switching.

## 📋 Files to Migrate (5 total)

### 1. RosterBuilder.tsx
**Current imports**: `assignParticipant`, `lockParticipant`, `releaseLock`, `unassignParticipant`, `createEventEventSource`
**New approach**: Use React Query mutations + real-time subscriptions via new API

### 2. ParticipantPool.tsx  
**Current imports**: `getActiveLocks`, `getAllParticipants`, `getHelpers`, `isHelperAvailableForEvent`, `createDraftLocksEventSource`, `createHelpersEventSource`
**New approach**: Use `useHelpersQuery`, `useParticipantsQuery`, plus real-time subscriptions

### 3. RosterManagement.tsx
**Current imports**: `getEvent`
**New approach**: Use `useEventQuery(eventId)`

### 4. EventManagement.tsx
**Current imports**: `deleteEvent`, `updateEvent`
**New approach**: Use `useDeleteEventMutation`, `useUpdateEventMutation`

### 5. EventHeader.tsx
**Current imports**: `deleteEvent`, `updateEvent`  
**New approach**: Use `useDeleteEventMutation`, `useUpdateEventMutation`

## 🚀 Quick Start

1. **Run audit**: `node scripts/validate-migration.js 7`
2. **Pick a file**: Start with `EventHeader.tsx` (simplest)
3. **Replace imports**: 
   ```typescript
   // OLD
   import { deleteEvent, updateEvent } from '../../lib/schedulingApi.js';
   
   // NEW
   import { useDeleteEventMutation, useUpdateEventMutation } from '../../hooks/queries/useEventsQuery.js';
   ```
4. **Update usage**: Replace direct function calls with React Query mutations
5. **Test**: Verify functionality works the same
6. **Validate**: Run `pnpm --filter website run typecheck`

## ✅ Success Criteria
- [ ] All 5 files migrated
- [ ] Zero imports from `schedulingApi.js`
- [ ] TypeScript compilation passes
- [ ] All functionality preserved
- [ ] Environment switching works (`VITE_USE_MOCK_API=true/false`)

## 🔄 After Migration
The old `schedulingApi.js` file can be deleted since all imports will use the new API system.