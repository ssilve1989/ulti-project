# Phase 4: Factory Integration & Export Cleanup

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Phases 1-3

## Overview

**Goal**: Complete the factory integration by connecting the implemented mock and HTTP APIs, and provide a clean export interface.

**Strategy**: Update the factory to use the actual implementations from Phases 2-3, and export the factory directly for consumption.

## Implementation

### Step 4.1: Complete Factory Integration

**File**: `src/lib/api/factory.ts` (MODIFY existing)

Update the placeholder methods to use the actual implementations:

```typescript
import type { ISchedulingApi, IApiContext, IApiConfig } from './interfaces/index.js';
import { createMockSchedulingApi } from './implementations/mock/index.js';
import { HttpSchedulingApi } from './implementations/http/index.js';

// Replace the placeholder methods in the existing ApiFactory class:

private createMockApi(context: IApiContext): ISchedulingApi {
  return createMockSchedulingApi(context);
}

private createHttpApi(context: IApiContext): ISchedulingApi {
  if (!this.config.apiBaseUrl) {
    throw new Error('API base URL required for HTTP implementation');
  }
  return new HttpSchedulingApi(this.config.apiBaseUrl, context);
}

// Update the createDefaultConfig to use proper environment variables:
export const createDefaultConfig = (): IApiConfig => ({
  useMockData: import.meta.env.VITE_USE_MOCK_API !== 'false',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  defaultGuildId: import.meta.env.VITE_DEFAULT_GUILD_ID || 'default-guild'
});
```

### Step 4.2: Update Main API Index

**File**: `src/lib/api/index.ts` (MODIFY existing)

Update the main API index to export the factory and convenience function:

```typescript
// Export all interfaces
export type {
  IApiContext,
  IApiConfig,
  IEventsApi,
  IHelpersApi,
  IRosterApi,
  ILocksApi,
  IPaginatedResponse,
  ISchedulingApi
} from './interfaces/index.js';

// Export factory and configuration
export { ApiFactory, createDefaultConfig } from './factory.js';

// Convenience function for creating API instances directly
export const createSchedulingApi = (guildId?: string) => {
  const config = createDefaultConfig();
  const factory = ApiFactory.getInstance(config);
  return factory.createSchedulingApi(guildId);
};
```

### Step 4.3: Add Environment Configuration

**File**: `src/env.d.ts` (MODIFY to add API environment variables)

```typescript
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TOKEN?: string;
  readonly VITE_DEFAULT_GUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

## Acceptance Criteria

- [ ] Factory placeholder methods replaced with actual implementations
- [ ] Main API index exports factory and convenience function
- [ ] Environment variables properly typed
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

## Validation Commands

```bash
# Test TypeScript compilation
pnpm --filter website run type-check

# Verify factory integration
grep -n "createMockApi\|createHttpApi" apps/website/src/lib/api/factory.ts

# Verify exports updated
grep -n "createSchedulingApi" apps/website/src/lib/api/index.ts
```

## File Operations

- **MODIFY**: `src/lib/api/factory.ts` (replace placeholder methods)
- **MODIFY**: `src/lib/api/index.ts` (update exports)
- **MODIFY**: `src/env.d.ts` (add API environment variables)

## Ready for Phase 5

Factory integration complete. Ready for Phase 5 environment testing and validation.
---

**Phase Dependencies**: ✅ Phases 1-3  
**Next Phase**: [Phase 5: Environment & Testing](./phase-5-environment-testing.md)
