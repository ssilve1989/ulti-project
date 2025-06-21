# AI Agent Execution Checklist

## 🚀 Quick Start Validation

**Before starting ANY phase:**

```bash
cd /Users/steve/dev/ulti-project
pnpm --filter website run typecheck  # Must pass
pnpm --filter website run build      # Must succeed
```

**If either fails, STOP and fix errors before proceeding.**

---

## Phase 1: API Interfaces ✅

### Task 1.1: Base Infrastructure

- [ ] Create `apps/website/src/lib/api/interfaces/base.ts`
- [ ] Create `apps/website/src/lib/api/interfaces/index.ts`
- [ ] Run: `pnpm --filter website run typecheck`

### Task 1.2: Events Interface

- [ ] Create `apps/website/src/lib/api/interfaces/events.ts`
- [ ] Update `apps/website/src/lib/api/interfaces/index.ts` exports
- [ ] Run: `pnpm --filter website run typecheck`

### Task 1.3: Helpers Interface

- [ ] Create `apps/website/src/lib/api/interfaces/helpers.ts`
- [ ] Update exports in index.ts
- [ ] Run: `pnpm --filter website run typecheck`

### Task 1.4: Roster Interface

- [ ] Create `apps/website/src/lib/api/interfaces/roster.ts`
- [ ] Update exports in index.ts
- [ ] Run: `pnpm --filter website run typecheck`

### Task 1.5: Locks Interface

- [ ] Create `apps/website/src/lib/api/interfaces/locks.ts`
- [ ] Update exports in index.ts
- [ ] Run: `pnpm --filter website run typecheck`

### Task 1.6: Factory Pattern

- [ ] Create `apps/website/src/lib/api/factory.ts`
- [ ] Update exports in index.ts
- [ ] Run: `pnpm --filter website run typecheck`

**Phase 1 Complete Validation:**

```bash
test -f apps/website/src/lib/api/interfaces/base.ts || exit 1
test -f apps/website/src/lib/api/interfaces/events.ts || exit 1
test -f apps/website/src/lib/api/interfaces/helpers.ts || exit 1
test -f apps/website/src/lib/api/interfaces/roster.ts || exit 1
test -f apps/website/src/lib/api/interfaces/locks.ts || exit 1
test -f apps/website/src/lib/api/factory.ts || exit 1
pnpm --filter website run typecheck
```

---

## Phase 2: Mock Enhancement ✅

### Task 2.1: Events Mock

- [ ] **BACKUP**: `cp apps/website/src/lib/mock/events.ts apps/website/src/lib/mock/events.ts.backup`
- [ ] Enhance existing events.ts with guild parameters
- [ ] Run: `pnpm --filter website run typecheck`
- [ ] Test: `node -e "import('./apps/website/src/lib/mock/events.js').then(() => console.log('✅ Events working'))"`

### Task 2.2: Participants Mock

- [ ] Create `apps/website/src/lib/mock/participants.ts`
- [ ] Run: `pnpm --filter website run typecheck`

### Task 2.3: Helpers Mock  

- [ ] **BACKUP**: `cp apps/website/src/lib/mock/helpers.ts apps/website/src/lib/mock/helpers.ts.backup`
- [ ] Enhance existing helpers.ts
- [ ] Run: `pnpm --filter website run typecheck`

### Task 2.4: Locks Mock

- [ ] **BACKUP**: `cp apps/website/src/lib/mock/locks.ts apps/website/src/lib/mock/locks.ts.backup`
- [ ] Enhance existing locks.ts
- [ ] Run: `pnpm --filter website run typecheck`

### Task 2.5: Interface Wrappers

- [ ] Create `apps/website/src/lib/api/implementations/mock/` directory
- [ ] Create all mock implementation classes
- [ ] Create index.ts with exports
- [ ] Run: `pnpm --filter website run typecheck`

**Phase 2 Complete Validation:**

```bash
# Verify backward compatibility
node -e "import('./apps/website/src/lib/schedulingApi.js').then(() => console.log('✅ Original API working'))"
pnpm --filter website run typecheck
```

---

## Phase 3: HTTP Implementation ✅

### Task 3.1: Base HTTP Client

- [ ] Create `apps/website/src/lib/api/implementations/http/BaseHttpClient.ts`
- [ ] Run: `pnpm --filter website run typecheck`

### Task 3.2: HTTP API Classes

- [ ] Create `apps/website/src/lib/api/implementations/http/HttpEventsApi.ts`
- [ ] Create `apps/website/src/lib/api/implementations/http/HttpHelpersApi.ts`
- [ ] Create `apps/website/src/lib/api/implementations/http/HttpRosterApi.ts`
- [ ] Create `apps/website/src/lib/api/implementations/http/HttpLocksApi.ts`
- [ ] Run: `pnpm --filter website run typecheck` after each file

### Task 3.3: Error Handling

- [ ] Create `apps/website/src/lib/api/implementations/http/errors.ts`
- [ ] Update HTTP classes to use error handling
- [ ] Run: `pnpm --filter website run typecheck`

### Task 3.4: HTTP Factory

- [ ] Create `apps/website/src/lib/api/implementations/http/index.ts`
- [ ] Run: `pnpm --filter website run typecheck`

**Phase 3 Complete Validation:**

```bash
test -d apps/website/src/lib/api/implementations/http || exit 1
pnpm --filter website run typecheck
```

---

## Phase 4: Client Integration ✅

### Task 4.1: Update Factory

- [ ] Modify `apps/website/src/lib/api/factory.ts` for implementation selection
- [ ] Run: `pnpm --filter website run typecheck`

### Task 4.2: Unified Client

- [ ] Create `apps/website/src/lib/api/client.ts`
- [ ] Run: `pnpm --filter website run typecheck`

### Task 4.3: Backward Compatibility

- [ ] Update `apps/website/src/lib/schedulingApi.ts` to use new client
- [ ] Run: `pnpm --filter website run typecheck`

**Phase 4 Complete Validation:**

```bash
test -f apps/website/src/lib/api/client.ts || exit 1
pnpm --filter website run typecheck
```

---

## Phase 5: Environment & Testing ✅

### Task 5.1: Environment Config

- [ ] Update `apps/website/astro.config.mjs`
- [ ] Create `.env.development` and `.env.production`
- [ ] Run: `pnpm --filter website run build`

### Task 5.2: Test Suite

- [ ] Create `apps/website/src/lib/api/__tests__/` directory
- [ ] Create integration.test.ts
- [ ] Create performance.test.ts
- [ ] Run: `pnpm --filter website test --run`

### Task 5.3: Development Tools

- [ ] Create `apps/website/src/components/dev/ApiDevTools.tsx`
- [ ] Update client.ts with dev tools
- [ ] Test: `VITE_USE_MOCK_API=true pnpm --filter website run dev` (should start without errors)

### Task 5.4: Performance Validation

- [ ] Run performance tests
- [ ] Validate both environments build: `VITE_USE_MOCK_API=false pnpm --filter website run build`

**Phase 5 Complete Validation:**

```bash
pnpm --filter website test --run
VITE_USE_MOCK_API=true pnpm --filter website run build
VITE_USE_MOCK_API=false pnpm --filter website run build
```

---

## Phase 6: Finalization ✅

### Task 6.1: Hook Migration

- [ ] **BACKUP**: `cp apps/website/src/hooks/useEvents.ts apps/website/src/hooks/useEvents.ts.backup`
- [ ] Update `apps/website/src/hooks/useEvents.ts`
- [ ] Update `apps/website/src/hooks/useHelpers.ts`
- [ ] Create migration test file
- [ ] Run: `pnpm --filter website test --run src/hooks`

### Task 6.2: Cleanup

- [ ] Update `apps/website/src/lib/schedulingApi.ts` for final compatibility
- [ ] Create `scripts/migration-complete.js`
- [ ] Run: `node scripts/migration-complete.js`

### Task 6.3: Documentation

- [ ] Create `docs/API_USAGE_GUIDE.md`
- [ ] Update `README.md`
- [ ] Run: `pnpm --filter website run build`

**Phase 6 Complete Validation:**

```bash
node scripts/migration-complete.js
pnpm --filter website run build
pnpm --filter website test --run
```

---

## 🚨 Critical Failure Points

### Immediate STOP Conditions

**Stop execution if any of these occur:**

1. **TypeScript Errors**: `pnpm --filter website run typecheck` fails
2. **Build Failures**: `pnpm --filter website run build` fails  
3. **Backward Compatibility Break**: Original `schedulingApi.ts` functions stop working
4. **Import Errors**: `.ts` extensions used instead of `.js` in imports
5. **Missing Dependencies**: Phase prerequisites not met

### Recovery Commands

**If Phase 2 fails:**

```bash
mv apps/website/src/lib/mock/*.backup apps/website/src/lib/mock/
rm -rf apps/website/src/lib/api/implementations/mock/
```

**If Phase 3+ fails:**

```bash
git checkout -- apps/website/src/lib/api/
git checkout -- apps/website/astro.config.mjs
```

---

## ✅ Final Success Validation

**System ready when ALL of these pass:**

```bash
# 1. TypeScript compilation
pnpm --filter website run typecheck

# 2. Both environment modes build
VITE_USE_MOCK_API=true pnpm --filter website run build
VITE_USE_MOCK_API=false pnpm --filter website run build

# 3. All tests pass
pnpm --filter website test --run

# 4. Migration completion confirmed
node scripts/migration-complete.js

# 5. Development mode starts
VITE_USE_MOCK_API=true pnpm --filter website run dev &
sleep 5 && kill $!
```

**Success Criteria:**

- ✅ 25 tasks completed across 6 phases
- ✅ Zero TypeScript errors
- ✅ Original functionality preserved
- ✅ Environment switching functional
- ✅ All tests passing
- ✅ Production-ready architecture

**Result**: Enhanced mock system with production-ready API architecture! 🚀
