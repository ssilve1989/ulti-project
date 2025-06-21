# AI Agent Execution Guide

## Overview

This guide provides **step-by-step instructions for AI agents** to execute the 6-phase migration without failure. Each section includes **validation checkpoints**, **error recovery**, and **rollback procedures**.

---

## 🎯 Pre-Execution Requirements

### Environment Setup

**Step 1**: Verify workspace structure

```bash
# Verify project structure
ls -la /Users/steve/dev/ulti-project/
ls -la /Users/steve/dev/ulti-project/apps/website/src/lib/

# Expected directories:
# ✅ apps/website/src/lib/mock/ (existing)
# ✅ apps/website/src/lib/schedulingApi.ts (existing)
# ✅ packages/shared/ (existing)
```

**Step 2**: Verify package management and scripts

```bash
# Check pnpm workspace
cd /Users/steve/dev/ulti-project
pnpm --version  # Should be >= 8.0

# Verify workspace packages
pnpm list --depth=0

# Check website package scripts
cd apps/website
cat package.json | grep -A 10 "scripts"
```

**Step 3**: Baseline validation

```bash
# Ensure current system works
pnpm --filter website run typecheck
pnpm --filter website run build

# Test current mock system (should pass)
pnpm --filter website test --run --if-present
```

**⚠️ CRITICAL**: If any pre-execution step fails, **STOP** and resolve before proceeding.

---

## 📋 Phase-by-Phase Execution Strategy

### Phase Execution Template

For **each phase**, follow this pattern:

1. **Pre-phase Validation** - Verify prerequisites
2. **Task Execution** - Complete each granular task sequentially  
3. **Post-task Validation** - Run acceptance criteria after each task
4. **Phase Completion** - Verify entire phase before moving to next
5. **Error Recovery** - Rollback procedure if validation fails

---

## Phase 1: API Interface Layer

### Pre-Phase Validation

```bash
# Verify shared package types are available
pnpm --filter website run typecheck 2>&1 | grep -E "(error|Error)" || echo "✅ No TypeScript errors"

# Ensure clean git state (recommended)
git status --porcelain || echo "⚠️  Working directory not clean"
```

### Task Execution Sequence

**Execute tasks 1.1 → 1.6 in strict order:**

#### Task 1.1: Base Interface Infrastructure

```bash
# Create directories
mkdir -p apps/website/src/lib/api/interfaces

# Execute Step 1.1.1: Create base.ts
# [Create file as specified in phase-1-interfaces.md]

# Execute Step 1.1.2: Create index.ts
# [Create file as specified in phase-1-interfaces.md]

# VALIDATION CHECKPOINT
pnpm --filter website run typecheck
if [ $? -ne 0 ]; then
  echo "❌ Task 1.1 FAILED - TypeScript errors"
  exit 1
fi
echo "✅ Task 1.1 Complete"
```

#### Task 1.2: Events API Interface

```bash
# Execute Step 1.2.1: Create events.ts
# [Create file as specified in phase-1-interfaces.md]

# Execute Step 1.2.2: Update index.ts exports
# [Modify file as specified in phase-1-interfaces.md]

# VALIDATION CHECKPOINT
pnpm --filter website run typecheck
grep -n "interface IEventsApi" apps/website/src/lib/api/interfaces/events.ts
if [ $? -ne 0 ]; then
  echo "❌ Task 1.2 FAILED - Interface not found"
  exit 1
fi
echo "✅ Task 1.2 Complete"
```

#### Tasks 1.3-1.6: Continue Pattern

Follow the same validation pattern for each remaining task.

### Phase 1 Completion Validation

```bash
# Comprehensive phase validation
pnpm --filter website run typecheck

# Verify all interfaces exist
test -f apps/website/src/lib/api/interfaces/base.ts || exit 1
test -f apps/website/src/lib/api/interfaces/events.ts || exit 1
test -f apps/website/src/lib/api/interfaces/helpers.ts || exit 1
test -f apps/website/src/lib/api/interfaces/roster.ts || exit 1
test -f apps/website/src/lib/api/interfaces/locks.ts || exit 1
test -f apps/website/src/lib/api/factory.ts || exit 1
test -f apps/website/src/lib/api/interfaces/index.ts || exit 1

# Verify exports work
node -e "
try { 
  import('./apps/website/src/lib/api/interfaces/index.js').then(() => console.log('✅ Phase 1 exports working')); 
} catch(e) { 
  console.error('❌ Phase 1 exports failed:', e); 
  process.exit(1); 
}"

echo "🎉 Phase 1 COMPLETE"
```

---

## Phase 2: Mock Enhancement

### Pre-Phase Validation

```bash
# Verify Phase 1 complete
test -f apps/website/src/lib/api/interfaces/index.ts || { echo "❌ Phase 1 incomplete"; exit 1; }

# Verify existing mock files
test -f apps/website/src/lib/mock/events.ts || { echo "❌ Mock files missing"; exit 1; }

pnpm --filter website run typecheck || { echo "❌ TypeScript errors before Phase 2"; exit 1; }
```

### Critical Points for AI Agents

**⚠️ PRESERVE EXISTING FUNCTIONALITY**: Never modify existing function signatures that break backward compatibility.

#### Task 2.1: Events Mock Enhancement

```bash
# Backup existing file
cp apps/website/src/lib/mock/events.ts apps/website/src/lib/mock/events.ts.backup

# Execute enhancement steps
# [Follow phase-2-mock-implementations.md exactly]

# VALIDATION CHECKPOINT
pnpm --filter website run typecheck

# Test backward compatibility
node -e "
import('./apps/website/src/lib/mock/events.js').then(api => {
  // Test existing function still works
  if (typeof api.createEvent === 'function') {
    console.log('✅ Backward compatibility preserved');
  } else {
    console.error('❌ Existing functions broken');
    process.exit(1);
  }
});
"
```

#### Error Recovery for Phase 2

```bash
# If validation fails, restore backup
if [ $? -ne 0 ]; then
  echo "⚠️  Rolling back Task 2.1"
  mv apps/website/src/lib/mock/events.ts.backup apps/website/src/lib/mock/events.ts
  exit 1
fi
```

Continue this pattern for all Phase 2 tasks.

---

## Phase 3: HTTP Implementation

### Pre-Phase Validation

```bash
# Verify Phase 2 complete
ls apps/website/src/lib/api/implementations/mock/ || { echo "❌ Phase 2 incomplete"; exit 1; }

# Verify no HTTP implementations exist yet
! ls apps/website/src/lib/api/implementations/http/ 2>/dev/null || { echo "⚠️  HTTP implementations already exist"; }
```

### Task Execution Strategy

**Key Success Factors:**

- Create all HTTP classes that implement the same interfaces as mock
- Add comprehensive error handling and retry logic
- Include authentication support for production

#### Critical Validation Points

```bash
# After each HTTP implementation file:
pnpm --filter website run typecheck

# Verify interface compliance
node -e "
import('./apps/website/src/lib/api/implementations/http/index.js').then(impl => {
  // Verify all expected classes exported
  const required = ['HttpEventsApi', 'HttpHelpersApi', 'HttpRosterApi', 'HttpLocksApi'];
  const missing = required.filter(name => !impl[name]);
  if (missing.length > 0) {
    console.error('❌ Missing HTTP implementations:', missing);
    process.exit(1);
  }
  console.log('✅ HTTP implementations complete');
});
"
```

---

## Phase 4: Client Integration

### Pre-Phase Validation

```bash
# Verify both implementations exist
test -d apps/website/src/lib/api/implementations/mock || exit 1
test -d apps/website/src/lib/api/implementations/http || exit 1

# Verify factory exists
test -f apps/website/src/lib/api/factory.ts || exit 1
```

### Critical Integration Points

**Factory Pattern Validation:**

```bash
# Test factory can create both implementations
node -e "
import('./apps/website/src/lib/api/factory.js').then(factory => {
  // Test mock creation
  const mockApi = factory.createApiImplementation({ guildId: 'test', useMockData: true });
  
  // Test HTTP creation  
  const httpApi = factory.createApiImplementation({ guildId: 'test', useMockData: false });
  
  if (mockApi && httpApi) {
    console.log('✅ Factory working correctly');
  } else {
    console.error('❌ Factory failed');
    process.exit(1);
  }
});
"
```

---

## Phase 5: Environment & Testing

### Pre-Phase Validation

```bash
# Verify unified client exists
test -f apps/website/src/lib/api/client.ts || exit 1

# Check Astro config exists
test -f apps/website/astro.config.mjs || exit 1
```

### Environment Configuration Strategy

#### Step-by-Step Environment Setup

```bash
# 1. Update Astro config
# [Follow phase-5-environment-testing.md]

# 2. Create environment files
cat > apps/website/.env.development << 'EOF'
VITE_USE_MOCK_API=true
VITE_DEFAULT_GUILD_ID=dev-guild-123
EOF

cat > apps/website/.env.production << 'EOF'
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://api.your-domain.com
VITE_DEFAULT_GUILD_ID=prod-guild-456
EOF

# 3. Validation
pnpm --filter website run build

# 4. Test environment switching
VITE_USE_MOCK_API=true pnpm --filter website run dev &
DEV_PID=$!
sleep 5
kill $DEV_PID

VITE_USE_MOCK_API=false pnpm --filter website run build
```

### Testing Strategy

**Comprehensive Test Execution:**

```bash
# Create test files exactly as specified
# [Follow phase-5-environment-testing.md for all test files]

# Run integration tests
pnpm --filter website test --run src/lib/api/__tests__/integration.test.ts

# Run performance tests  
pnpm --filter website test --run src/lib/api/__tests__/performance.test.ts

# Verify all tests pass
pnpm --filter website test --run
```

---

## Phase 6: Integration Finalization

### Pre-Phase Validation

```bash
# Verify complete system works
pnpm --filter website run build
pnpm --filter website test --run

# Check development tools work in dev mode
VITE_USE_MOCK_API=true pnpm --filter website run dev &
DEV_PID=$!
sleep 10
kill $DEV_PID
```

### Hook Migration Strategy

**Gradual Migration Pattern:**

```bash
# Backup existing hooks
cp apps/website/src/hooks/useEvents.ts apps/website/src/hooks/useEvents.ts.backup

# Migrate one hook at a time
# [Follow phase-6-cleanup.md exactly]

# Test each hook after migration
pnpm --filter website test --run src/hooks/__tests__/migration.test.ts
```

---

## 🚨 Error Recovery Procedures

### General Rollback Strategy

**If any phase fails:**

```bash
# 1. Stop immediately
echo "🛑 Migration failed at Phase X, Task Y"

# 2. Document the failure
echo "Error details: $ERROR_MESSAGE" >> migration-errors.log

# 3. Restore from backups if available
# [Specific rollback steps depend on phase]

# 4. Verify system still works
pnpm --filter website run typecheck
pnpm --filter website run build
```

### Phase-Specific Rollbacks

#### Phase 1 Rollback

```bash
# Remove interface files
rm -rf apps/website/src/lib/api/interfaces/
rm -f apps/website/src/lib/api/factory.ts

# Verify original system still works
pnpm --filter website run typecheck
```

#### Phase 2 Rollback  

```bash
# Restore original mock files
mv apps/website/src/lib/mock/*.backup apps/website/src/lib/mock/
rm -rf apps/website/src/lib/api/implementations/mock/

# Verify original functionality
pnpm --filter website test --run --if-present
```

#### Phase 3+ Rollbacks

```bash
# Remove HTTP implementations
rm -rf apps/website/src/lib/api/implementations/http/

# Remove client files if Phase 4+
rm -f apps/website/src/lib/api/client.ts

# Restore environment files
git checkout apps/website/astro.config.mjs apps/website/.env*
```

---

## 🎯 Final Validation Checklist

### Complete System Validation

**After Phase 6 completion:**

```bash
# 1. TypeScript compilation
pnpm --filter website run typecheck

# 2. Build verification
pnpm --filter website run build

# 3. Test suite
pnpm --filter website test --run

# 4. Mock API functionality
VITE_USE_MOCK_API=true pnpm --filter website run dev &
DEV_PID=$!
# [Test key features manually or with E2E tests]
kill $DEV_PID

# 5. HTTP API stub functionality  
VITE_USE_MOCK_API=false pnpm --filter website run build

# 6. Migration completion script
node scripts/migration-complete.js
```

### Success Criteria

**✅ Migration considered successful when:**

- All TypeScript compilation passes
- All tests pass
- Both mock and HTTP modes build successfully
- Original functionality preserved
- New features accessible
- No runtime errors in either mode
- Development tools work correctly

---

## 🔧 Debugging Tips for AI Agents

### Common Issues and Solutions

#### TypeScript Import Errors

```bash
# Verify ESM imports use .js extensions
grep -r "from.*\.ts" apps/website/src/lib/api/
# ❌ Should show no results (use .js extensions)

# Fix import extensions
sed -i '' 's/\.ts"/\.js"/g' apps/website/src/lib/api/**/*.ts
```

#### Environment Variable Issues

```bash
# Check environment variables are loaded
node -e "console.log('VITE_USE_MOCK_API:', import.meta.env.VITE_USE_MOCK_API)"

# Verify Astro configuration
grep -A 5 -B 5 "vite:" apps/website/astro.config.mjs
```

#### Test Failures

```bash
# Run specific test file with verbose output
pnpm --filter website test --run --reporter=verbose src/lib/api/__tests__/integration.test.ts

# Check mock/HTTP switching in tests
grep -r "import.meta.env" apps/website/src/lib/api/__tests__/
```

#### Runtime Errors

```bash
# Check browser console in dev mode
VITE_USE_MOCK_API=true pnpm --filter website run dev
# Open browser developer tools and check for errors

# Verify API factory instantiation
node -e "
import('./apps/website/src/lib/api/client.js').then(client => {
  console.log('Available exports:', Object.keys(client));
});
"
```

---

## 📊 Progress Tracking

### Phase Completion Checklist

**Track progress with this checklist:**

- [ ] **Phase 1 Complete**: All interfaces defined, factory pattern created
- [ ] **Phase 2 Complete**: Mock implementations enhanced, backward compatibility preserved  
- [ ] **Phase 3 Complete**: HTTP implementations created, error handling added
- [ ] **Phase 4 Complete**: Unified client created, environment switching works
- [ ] **Phase 5 Complete**: Tests pass, environment configuration complete
- [ ] **Phase 6 Complete**: Hooks migrated, documentation updated, system finalized

### Time Estimates

**Realistic execution times for AI agents:**

- **Phase 1**: 2-3 hours (interface definitions)
- **Phase 2**: 3-4 hours (mock enhancement complexity)  
- **Phase 3**: 2-3 hours (HTTP implementation)
- **Phase 4**: 1-2 hours (integration)
- **Phase 5**: 2-3 hours (testing and environment)
- **Phase 6**: 1-2 hours (finalization)

**Total: 11-17 hours** of focused AI agent execution time.

---

## 🎉 Migration Success

**When all phases complete successfully:**

The system will have:

✅ **Zero Breaking Changes**: All existing functionality preserved  
✅ **Production Ready**: HTTP implementations ready for backend integration  
✅ **Environment Flexible**: Seamless switching between mock and HTTP modes  
✅ **Fully Tested**: Comprehensive test coverage with integration and performance tests  
✅ **Developer Friendly**: Enhanced development tools and debugging capabilities  
✅ **Future Proof**: Clean architecture ready for backend API when available  

**The migration transforms the mock system into a production-ready, dependency-injected API architecture while preserving all existing sophisticated features.**

🚀 **Ready for production deployment!**
