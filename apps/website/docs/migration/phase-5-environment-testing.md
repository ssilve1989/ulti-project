# Phase 5: Environment & Testing

**Duration**: 45 minutes  
**Complexity**: Low  
**Dependencies**: Phase 4 (Factory Integration)

## Overview

**Goal**: Set up environment configuration and testing for the factory-based API system.

**Strategy**: Configure environments and validate that the factory correctly switches between mock and HTTP implementations.

## Implementation

### Step 5.1: Configure Environment Variables

**File**: `.env.development` (CREATE)

```env
# Development environment - use mock API by default
VITE_USE_MOCK_API=true
VITE_API_BASE_URL=http://localhost:3000
VITE_DEFAULT_GUILD_ID=dev-guild
```

**File**: `.env.production` (CREATE)

```env
# Production environment - use real API
VITE_USE_MOCK_API=false
VITE_API_TIMEOUT=30000
# VITE_API_BASE_URL and VITE_DEFAULT_GUILD_ID set by deployment system
```

### Step 5.2: Create Factory Integration Test

**File**: `src/lib/api/__tests__/factory-integration.test.ts` (CREATE)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiFactory, createDefaultConfig } from '../factory.js';
import type { ISchedulingApi } from '../interfaces/index.js';

describe('Factory Integration Tests', () => {
  beforeEach(() => {
    // Reset factory instance
    (ApiFactory as any).instance = null;
  });

  it('should create mock API when VITE_USE_MOCK_API=true', () => {
    vi.stubEnv('VITE_USE_MOCK_API', 'true');
    vi.stubEnv('VITE_DEFAULT_GUILD_ID', 'test-guild');
    
    const config = createDefaultConfig();
    const factory = ApiFactory.getInstance(config);
    const api = factory.createSchedulingApi('test-guild');
    
    expect(api).toBeDefined();
    expect(api.events).toBeDefined();
    expect(api.helpers).toBeDefined();
    expect(api.roster).toBeDefined();
    expect(api.locks).toBeDefined();
  });

  it('should create HTTP API when VITE_USE_MOCK_API=false', () => {
    vi.stubEnv('VITE_USE_MOCK_API', 'false');
    vi.stubEnv('VITE_API_BASE_URL', 'http://test.example.com');
    vi.stubEnv('VITE_DEFAULT_GUILD_ID', 'test-guild');
    
    const config = createDefaultConfig();
    const factory = ApiFactory.getInstance(config);
    
    expect(() => factory.createSchedulingApi('test-guild')).not.toThrow();
  });

  it('should validate environment configuration', () => {
    vi.stubEnv('VITE_USE_MOCK_API', 'true');
    vi.stubEnv('VITE_DEFAULT_GUILD_ID', 'config-test-guild');
    
    const config = createDefaultConfig();
    expect(config.useMockData).toBe(true);
    expect(config.defaultGuildId).toBe('config-test-guild');
  });
});
```

### Step 5.3: Test Factory Usage Pattern

**File**: `src/lib/api/__tests__/usage-patterns.test.ts` (CREATE)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSchedulingApi } from '../index.js';

describe('API Usage Patterns', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK_API', 'true');
    vi.stubEnv('VITE_DEFAULT_GUILD_ID', 'pattern-test-guild');
  });

  it('should support direct factory usage', () => {
    const api = createSchedulingApi('test-guild');
    expect(api.events).toBeDefined();
    expect(api.helpers).toBeDefined();
  });

  it('should provide all expected API methods', async () => {
    const api = createSchedulingApi('test-guild');
    
    // Test that all main API methods exist
    expect(typeof api.events.getEvents).toBe('function');
    expect(typeof api.events.createEvent).toBe('function');
    expect(typeof api.helpers.getHelpers).toBe('function');
    expect(typeof api.roster.getParticipants).toBe('function');
    expect(typeof api.locks.lockParticipant).toBe('function');
  });

  it('should handle guild context correctly', () => {
    const api = createSchedulingApi('specific-guild');
    
    // Mock implementations should respect guild context
    expect(api.events.context.guildId).toBe('specific-guild');
    expect(api.helpers.context.guildId).toBe('specific-guild');
  });
});
```

## Acceptance Criteria

- [ ] Environment files created for development and production
- [ ] Factory integration tests validate mock and HTTP switching
- [ ] Usage pattern tests confirm expected API surface
- [ ] All tests pass: `pnpm --filter website test --run`
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

## Validation Commands

```bash
# Test factory integration
pnpm --filter website test --run src/lib/api/__tests__/factory-integration.test.ts

# Test usage patterns
pnpm --filter website test --run src/lib/api/__tests__/usage-patterns.test.ts

# Test with different environments
VITE_USE_MOCK_API=false pnpm --filter website test --run src/lib/api/__tests__/factory-integration.test.ts

# Full test suite
pnpm --filter website test --run

# Type checking
pnpm --filter website run type-check
```

## File Operations

- **CREATE**: `.env.development`
- **CREATE**: `.env.production`
- **CREATE**: `src/lib/api/__tests__/factory-integration.test.ts`
- **CREATE**: `src/lib/api/__tests__/usage-patterns.test.ts`

---

**Phase Dependencies**: ✅ Phase 4 (Factory Integration)  
**Next Phase**: [Phase 6: Integration Finalization](./phase-6-cleanup.md)