# AI Agent Migration Prompt - Optimized for Claude

## Mission

Execute 6-phase API migration: mock-only → dependency-injected architecture with mock/HTTP switching.

## Critical Requirements

- **Sequential only**: Phase 1→2→3→4→5→6 (never skip or parallel)
- **Validate every file**: `pnpm --filter website run typecheck` after each file operation
- **Stop on errors**: Never continue if typecheck/build fails
- **Preserve compatibility**: Phase 2 must not break existing function signatures
- **Use .js imports**: ESM project requires .js extensions in TypeScript imports

## Phase Overview

1. **Interfaces** (6 tasks) - Create API interface layer
2. **Mock Enhancement** (5 tasks) - Enhance existing mocks, add guild support
3. **HTTP Implementation** (4 tasks) - Create production HTTP clients  
4. **Client Integration** (3 tasks) - Factory pattern with environment switching
5. **Environment & Testing** (4 tasks) - Config, tests, validation
6. **Finalization** (3 tasks) - Hook migration, cleanup, documentation

## Execution Protocol

1. **Start Phase N**: Read `/docs/migration/phase-N-*.md` for detailed tasks
2. **Complete each task**: Follow exact code examples, create/modify files as specified
3. **Validate after each file**: Run typecheck, fix any TypeScript errors immediately
4. **Validate phase completion**: Run `node scripts/validate-migration.js N`
5. **Report progress**: "✅ Phase N, Task N.N complete" after each task
6. **Proceed to Phase N+1**: Only after phase validation passes

## Key Commands

```bash
# After every file operation
pnpm --filter website run typecheck

# After each phase
node scripts/validate-migration.js [phase-number]

# Final validation
node scripts/validate-migration.js all
```

## Success Criteria

- All 25 tasks completed (6+5+4+3+4+3)
- Zero TypeScript errors throughout
- Both environments build: `VITE_USE_MOCK_API=true/false`
- Original mock functionality preserved
- All tests pass: `pnpm --filter website test --run`

## Error Protocol  

If ANY validation fails:

1. STOP immediately
2. Report exact error and location
3. Do not continue to next task/phase
4. Request human guidance

## Session Resumption

Before starting, check migration status:

```bash
# Quick status check (recommended)
node scripts/validate-migration.js status

# Full validation (slower but thorough)
node scripts/validate-migration.js all
```

**Based on status results:**

- If all phases complete → Migration done
- If Phase N pending → Resume from Phase N
- If starting fresh → Begin with Phase 1

## Start Command

1. **Check status**: `node scripts/validate-migration.js status`
2. **Load appropriate phase**: Based on status, load `/docs/migration/phase-N-*.md`
3. **Report progress**: State which phase/task you're starting
4. **Execute sequentially**: Complete all tasks in current phase before moving to next

---

**Ready to check status and proceed?**
