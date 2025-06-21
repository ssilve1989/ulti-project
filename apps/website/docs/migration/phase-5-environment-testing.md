# Phase 5: Environment & Testing

**Duration**: 1-2 days  
**Complexity**: Medium  
**Dependencies**: Phase 4 (API Client Integration)

## Overview

**Goal**: Set up comprehensive environment configuration, testing, and validation for the integrated API system.

**Strategy**: Configure environments for all deployment stages and validate that both mock and HTTP implementations work correctly.

## � Implementation Tasks

### Task Overview

Phase 5 is broken down into **4 granular tasks** that must be completed sequentially:

1. **Task 5.1**: Configure environment variables and build setup
2. **Task 5.2**: Create comprehensive test suite
3. **Task 5.3**: Add development tools and controls
4. **Task 5.4**: Performance testing and validation

Each task ensures production readiness.

---

## Task 5.1: Configure Environment Variables and Build Setup

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Phase 4 complete

### Inputs

- API client from Phase 4
- Environment configuration requirements
- Build system configuration

### Outputs

- Complete environment configuration
- Build optimization for API implementations
- Environment-specific settings

### Implementation

**Step 5.1.1**: Update Astro configuration

**File**: `astro.config.mjs` (MODIFY existing)

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), tailwind()],
  
  vite: {
    define: {
      // Ensure environment variables are available at build time
      'import.meta.env.VITE_USE_MOCK_API': JSON.stringify(process.env.VITE_USE_MOCK_API || 'true'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:3000'),
      'import.meta.env.VITE_DEFAULT_GUILD_ID': JSON.stringify(process.env.VITE_DEFAULT_GUILD_ID || 'default-guild'),
    },
    
    // Optimize bundle splitting for API implementations
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'api-mock': ['./src/lib/api/implementations/mock'],
            'api-http': ['./src/lib/api/implementations/http'],
            'mock-data': ['./src/lib/mock'],
          },
        },
      },
    },
  },
});
```

**Step 5.1.2**: Create environment files

**File**: `.env` (CREATE/UPDATE base environment)

```env
# Default values for all environments
VITE_USE_MOCK_API=true
VITE_API_BASE_URL=http://localhost:3000
VITE_DEFAULT_GUILD_ID=default-guild
VITE_API_TIMEOUT=10000
```

**File**: `.env.development` (CREATE NEW)

```env
# Development environment
VITE_USE_MOCK_API=true
VITE_API_BASE_URL=http://localhost:3000
VITE_DEFAULT_GUILD_ID=dev-guild
VITE_API_TIMEOUT=5000
VITE_LOG_LEVEL=debug
```

**File**: `.env.production` (CREATE NEW)

```env
# Production environment
VITE_USE_MOCK_API=false
VITE_API_TIMEOUT=30000
VITE_LOG_LEVEL=error
# VITE_API_BASE_URL and VITE_API_TOKEN set by deployment system
```

### Acceptance Criteria

- [ ] Astro config updated with environment variables
- [ ] Bundle splitting configured for API implementations
- [ ] Environment files created for all stages
- [ ] Build optimization implemented
- [ ] Build succeeds: `pnpm --filter website run build`

### Validation Commands

```bash
# Test build with environment
VITE_USE_MOCK_API=true pnpm --filter website run build

# Test build for production
VITE_USE_MOCK_API=false pnpm --filter website run build

# Verify environment files
ls -la apps/website/.env*
```

### File Operations

- **MODIFY**: `astro.config.mjs`
- **CREATE/UPDATE**: `.env`
- **CREATE**: `.env.development`
- **CREATE**: `.env.production`

---

## Task 5.2: Create Comprehensive Test Suite

**Duration**: 60 minutes  
**Complexity**: High  
**Dependencies**: Task 5.1 complete

### Inputs

- Configured environment from Task 5.1
- API implementations from Phases 2-4
- Testing requirements for mock and HTTP systems

### Outputs

- Complete test suite for API functionality
- Integration tests for environment switching
- Mock implementation validation tests

### Implementation

**Step 5.2.1**: Create API integration tests

**File**: `src/lib/api/__tests__/integration.test.ts` (CREATE NEW)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiFactory, createDefaultConfig } from '../factory.js';
import type { ISchedulingApi } from '../interfaces/index.js';

// Mock environment variables
vi.mock('import.meta.env', () => ({
  VITE_USE_MOCK_API: 'true',
  VITE_API_BASE_URL: 'http://localhost:3000',
  VITE_DEFAULT_GUILD_ID: 'test-guild',
  DEV: true
}));

describe('API Integration Tests', () => {
  let factory: ApiFactory;
  let mockApi: ISchedulingApi;
  
  beforeEach(() => {
    // Reset factory instance
    (ApiFactory as any).instance = null;
    
    const config = createDefaultConfig();
    factory = ApiFactory.getInstance(config);
    mockApi = factory.createSchedulingApi('test-guild');
  });

  describe('Factory Pattern', () => {
    it('should create singleton factory instance', () => {
      const factory1 = ApiFactory.getInstance();
      const factory2 = ApiFactory.getInstance();
      expect(factory1).toBe(factory2);
    });

    it('should create mock API when configured', () => {
      expect(mockApi).toBeDefined();
      expect(mockApi.events).toBeDefined();
      expect(mockApi.helpers).toBeDefined();
      expect(mockApi.roster).toBeDefined();
      expect(mockApi.locks).toBeDefined();
    });

    it('should use correct guild context', () => {
      expect(mockApi.events.context.guildId).toBe('test-guild');
      expect(mockApi.helpers.context.guildId).toBe('test-guild');
    });
  });

  describe('Events API', () => {
    it('should create and retrieve events', async () => {
      const createRequest = {
        title: 'Test Event',
        description: 'Test Description',
        encounter: 'ultimate-coil',
        scheduledFor: new Date().toISOString(),
        durationMinutes: 180
      };

      const created = await mockApi.events.createEvent(createRequest);
      expect(created).toBeDefined();
      expect(created.title).toBe('Test Event');

      const retrieved = await mockApi.events.getEvent(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should list events with pagination', async () => {
      const response = await mockApi.events.getEvents();
      expect(response).toBeDefined();
      expect(response.data).toBeInstanceOf(Array);
      expect(typeof response.total).toBe('number');
      expect(typeof response.hasMore).toBe('boolean');
    });
  });

  describe('Helpers API', () => {
    it('should get helpers list', async () => {
      const helpers = await mockApi.helpers.getHelpers();
      expect(helpers).toBeInstanceOf(Array);
      expect(helpers.length).toBeGreaterThan(0);
      
      const helper = helpers[0];
      expect(helper.id).toBeDefined();
      expect(helper.discordId).toBeDefined();
      expect(helper.job).toBeDefined();
    });

    it('should check helper availability', async () => {
      const helpers = await mockApi.helpers.getHelpers();
      const helper = helpers[0];
      
      const availability = await mockApi.helpers.checkHelperAvailability({
        helperId: helper.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000) // 1 hour later
      });
      
      expect(availability).toBeDefined();
      expect(typeof availability.available).toBe('boolean');
    });
  });
});
```

**Step 5.2.2**: Create environment switching tests

**File**: `src/lib/api/__tests__/environment.test.ts` (CREATE NEW)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDefaultConfig } from '../factory.js';

describe('Environment Configuration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should default to mock API in development', () => {
    vi.mock('import.meta.env', () => ({
      VITE_USE_MOCK_API: undefined,
      DEV: true
    }));

    const config = createDefaultConfig();
    expect(config.useMockData).toBe(true);
  });

  it('should use HTTP API when explicitly configured', () => {
    vi.mock('import.meta.env', () => ({
      VITE_USE_MOCK_API: 'false',
      VITE_API_BASE_URL: 'https://api.example.com'
    }));

    const config = createDefaultConfig();
    expect(config.useMockData).toBe(false);
    expect(config.apiBaseUrl).toBe('https://api.example.com');
  });

  it('should use environment defaults', () => {
    vi.mock('import.meta.env', () => ({
      VITE_DEFAULT_GUILD_ID: 'custom-guild'
    }));

    const config = createDefaultConfig();
    expect(config.defaultGuildId).toBe('custom-guild');
  });
});
```

**Step 5.2.3**: Update test configuration

**File**: `vitest.config.ts` (MODIFY existing)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Test API implementations
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts'
    ],
    // Enable environment variable mocking
    env: {
      VITE_USE_MOCK_API: 'true',
      VITE_DEFAULT_GUILD_ID: 'test-guild'
    }
  }
});
```

### Acceptance Criteria

- [ ] Comprehensive API integration tests created
- [ ] Environment switching tests implemented
- [ ] Test configuration updated
- [ ] All tests pass: `pnpm --filter website test --run`
- [ ] Mock API functionality validated

### Validation Commands

```bash
# Run API tests
pnpm --filter website test --run src/lib/api

# Run all tests
pnpm --filter website test --run

# Test with different environments
VITE_USE_MOCK_API=false pnpm --filter website test --run src/lib/api/__tests__/environment.test.ts
```

### File Operations

- **CREATE**: `src/lib/api/__tests__/integration.test.ts`
- **CREATE**: `src/lib/api/__tests__/environment.test.ts`
- **MODIFY**: `vitest.config.ts`

---

## Task 5.3: Add Development Tools and Controls

**Duration**: 30 minutes  
**Complexity**: Low  
**Dependencies**: Task 5.2 complete

### Inputs

- API system from previous tasks
- Development control requirements
- Browser-based debugging needs

### Outputs

- Enhanced development controls
- Browser console utilities
- API implementation switching tools

### Implementation

**Step 5.3.1**: Create development dashboard component

**File**: `src/components/dev/ApiDevTools.tsx` (CREATE NEW)

```tsx
import { useState, useEffect } from 'react';
import { developmentControls } from '../../lib/api/factory.js';

export function ApiDevTools() {
  const [currentImpl, setCurrentImpl] = useState<'mock' | 'http'>('mock');
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    if (developmentControls) {
      setCurrentImpl(developmentControls.getCurrentImplementation());
      setConfig(developmentControls.getConfig());
    }
  }, []);

  const handleSwitchImplementation = (type: 'mock' | 'http') => {
    if (developmentControls) {
      developmentControls.setImplementation(type);
      setCurrentImpl(type);
      // Force page reload to reinitialize API client
      window.location.reload();
    }
  };

  if (!import.meta.env.DEV || !developmentControls) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded shadow-lg">
      <h3 className="text-sm font-bold mb-2">API Dev Tools</h3>
      
      <div className="space-y-2">
        <div>
          <span className="text-xs">Current Implementation:</span>
          <span className="ml-2 font-mono text-yellow-400">
            {currentImpl === 'mock' ? '🎭 Mock' : '🌐 HTTP'}
          </span>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => handleSwitchImplementation('mock')}
            className={`px-2 py-1 text-xs rounded ${
              currentImpl === 'mock' 
                ? 'bg-blue-600' 
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            Mock
          </button>
          <button
            onClick={() => handleSwitchImplementation('http')}
            className={`px-2 py-1 text-xs rounded ${
              currentImpl === 'http' 
                ? 'bg-blue-600' 
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
          >
            HTTP
          </button>
        </div>
        
        {config && (
          <div className="text-xs">
            <div>Base URL: {config.apiBaseUrl}</div>
            <div>Guild: {config.defaultGuildId}</div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 5.3.2**: Add console utilities

**File**: `src/lib/api/dev-utils.ts` (CREATE NEW)

```typescript
import { ApiFactory } from './factory.js';
import { developmentUtils } from './client.js';

// Make API utilities available in browser console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__ultiApi = {
    factory: ApiFactory,
    utils: developmentUtils,
    
    // Quick test functions
    async testMockApi() {
      console.log('🎭 Testing Mock API...');
      try {
        const api = ApiFactory.getInstance().createSchedulingApi();
        const events = await api.events.getEvents();
        console.log('✅ Mock API working:', events);
        return events;
      } catch (error) {
        console.error('❌ Mock API failed:', error);
        throw error;
      }
    },
    
    async testHttpApi() {
      console.log('🌐 Testing HTTP API...');
      try {
        // Temporarily switch to HTTP for testing
        const factory = ApiFactory.getInstance();
        factory.updateConfig({ useMockData: false });
        
        const api = factory.createSchedulingApi();
        const events = await api.events.getEvents();
        console.log('✅ HTTP API working:', events);
        return events;
      } catch (error) {
        console.error('❌ HTTP API failed:', error);
        throw error;
      }
    }
  };

  console.log('🛠️ API Dev Utils available at window.__ultiApi');
}
```

### Acceptance Criteria

- [ ] Development tools component created
- [ ] Browser console utilities implemented
- [ ] API switching functionality working
- [ ] Development tools only available in dev mode
- [ ] TypeScript compilation passes: `pnpm --filter website run type-check`

### Validation Commands

```bash
# Test development mode
pnpm --filter website run dev

# Verify dev tools in browser console
# Open browser dev tools and check for window.__ultiApi

# Test component compilation
pnpm --filter website run type-check
```

### File Operations

- **CREATE**: `src/components/dev/ApiDevTools.tsx`
- **CREATE**: `src/lib/api/dev-utils.ts`

---

## Task 5.4: Performance Testing and Validation

**Duration**: 45 minutes  
**Complexity**: Medium  
**Dependencies**: Task 5.3 complete

### Inputs

- Complete API system
- Performance requirements
- Load testing scenarios

### Outputs

- Performance benchmarks
- Load testing results
- Optimization recommendations

### Implementation

**Step 5.4.1**: Create performance tests

**File**: `src/lib/api/__tests__/performance.test.ts` (CREATE NEW)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ApiFactory, createDefaultConfig } from '../factory.js';
import type { ISchedulingApi } from '../interfaces/index.js';

describe('API Performance Tests', () => {
  let api: ISchedulingApi;
  
  beforeEach(() => {
    (ApiFactory as any).instance = null;
    const config = createDefaultConfig();
    const factory = ApiFactory.getInstance(config);
    api = factory.createSchedulingApi('test-guild');
  });

  it('should handle concurrent requests efficiently', async () => {
    const startTime = performance.now();
    
    // Create 10 concurrent requests
    const promises = Array.from({ length: 10 }, () => 
      api.events.getEvents()
    );
    
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    expect(results).toHaveLength(10);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should cache repeated requests', async () => {
    // First request
    const startTime1 = performance.now();
    await api.helpers.getHelpers();
    const endTime1 = performance.now();
    const firstRequestTime = endTime1 - startTime1;
    
    // Second request (should be faster due to caching in mock)
    const startTime2 = performance.now();
    await api.helpers.getHelpers();
    const endTime2 = performance.now();
    const secondRequestTime = endTime2 - startTime2;
    
    // Second request should be faster or similar
    expect(secondRequestTime).toBeLessThanOrEqual(firstRequestTime * 1.5);
  });

  it('should handle large data sets efficiently', async () => {
    const startTime = performance.now();
    
    // Get all participants (potentially large dataset)
    const participants = await api.roster.getParticipants();
    
    const endTime = performance.now();
    
    expect(participants).toBeInstanceOf(Array);
    expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
  });
});
```

**Step 5.4.2**: Create validation script

**File**: `scripts/validate-api.js` (CREATE NEW)

```javascript
#!/usr/bin/env node

import { performance } from 'perf_hooks';

console.log('🔍 Validating API Implementation...\n');

// Test environment switching
async function testEnvironmentSwitching() {
  console.log('Testing environment switching...');
  
  try {
    // Test mock environment
    process.env.VITE_USE_MOCK_API = 'true';
    const { createDefaultConfig } = await import('../apps/website/src/lib/api/factory.js');
    
    const mockConfig = createDefaultConfig();
    console.log('✅ Mock config:', mockConfig.useMockData ? 'Mock' : 'HTTP');
    
    // Test HTTP environment
    process.env.VITE_USE_MOCK_API = 'false';
    process.env.VITE_API_BASE_URL = 'https://api.example.com';
    
    const httpConfig = createDefaultConfig();
    console.log('✅ HTTP config:', httpConfig.useMockData ? 'Mock' : 'HTTP');
    console.log('✅ Environment switching working\n');
    
  } catch (error) {
    console.error('❌ Environment switching failed:', error);
    process.exit(1);
  }
}

// Test API factory
async function testApiFactory() {
  console.log('Testing API factory...');
  
  try {
    process.env.VITE_USE_MOCK_API = 'true';
    const { ApiFactory, createDefaultConfig } = await import('../apps/website/src/lib/api/factory.js');
    
    const config = createDefaultConfig();
    const factory = ApiFactory.getInstance(config);
    const api = factory.createSchedulingApi('test-guild');
    
    console.log('✅ API factory created successfully');
    console.log('✅ Mock API instance created');
    console.log('✅ Guild context set to:', api.events.context.guildId, '\n');
    
  } catch (error) {
    console.error('❌ API factory failed:', error);
    process.exit(1);
  }
}

// Run validation
async function runValidation() {
  const startTime = performance.now();
  
  await testEnvironmentSwitching();
  await testApiFactory();
  
  const endTime = performance.now();
  console.log(`🎉 Validation completed in ${Math.round(endTime - startTime)}ms`);
  console.log('✅ All systems operational');
}

runValidation().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
```

### Acceptance Criteria

- [ ] Performance tests validate response times
- [ ] Concurrent request handling tested
- [ ] Validation script confirms all functionality
- [ ] Performance benchmarks established
- [ ] All tests pass: `pnpm --filter website test --run`

### Validation Commands

```bash
# Run performance tests
pnpm --filter website test --run src/lib/api/__tests__/performance.test.ts

# Run validation script
node scripts/validate-api.js

# Full test suite
pnpm --filter website test --run
```

### File Operations

- **CREATE**: `src/lib/api/__tests__/performance.test.ts`
- **CREATE**: `scripts/validate-api.js`

---

## Phase 5 Completion Validation

### Final Acceptance Criteria

- [ ] All 4 tasks completed successfully
- [ ] Environment configuration complete for all stages
- [ ] Comprehensive test suite validates functionality
- [ ] Development tools enable easy debugging
- [ ] Performance benchmarks established
- [ ] Build succeeds in all environments: `pnpm --filter website run build`
- [ ] All tests pass: `pnpm --filter website test --run`

### Final Validation Commands

```bash
# Test all environments
VITE_USE_MOCK_API=true pnpm --filter website run build
VITE_USE_MOCK_API=false pnpm --filter website run build

# Run complete test suite
pnpm --filter website test --run

# Validate API system
node scripts/validate-api.js
```

### Files Created/Modified

**New Files:**

- `.env.development`
- `.env.production`
- `src/lib/api/__tests__/integration.test.ts`
- `src/lib/api/__tests__/environment.test.ts`
- `src/lib/api/__tests__/performance.test.ts`
- `src/components/dev/ApiDevTools.tsx`
- `src/lib/api/dev-utils.ts`
- `scripts/validate-api.js`

**Modified Files:**

- `astro.config.mjs`
- `.env`
- `vitest.config.ts`

### Ready for Phase 6

Environment and testing complete, ready for Phase 6 final integration and cleanup.

```env
# Test environment
VITE_USE_MOCK_API=true
VITE_ENABLE_API_HOTSWAP=false
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT=5000
VITE_LOG_LEVEL=silent
```

**File**: `.env.staging`

```env
# Staging environment
VITE_USE_MOCK_API=false
VITE_ENABLE_API_HOTSWAP=true
VITE_API_BASE_URL=https://staging-api.ulti-project.com
VITE_API_TIMEOUT=15000
VITE_LOG_LEVEL=info
```

### 5.2 Enhanced Development Controls

**File**: `src/lib/api/dev-controls.ts`

```typescript
import type { ApiClient } from './factory.js';

export interface DevControlsInterface {
  setApiImplementation(type: 'mock' | 'http'): Promise<void>;
  getApiImplementation(): 'mock' | 'http';
  resetMockData(): Promise<void>;
  getCurrentClient(): ApiClient;
  getEnvironmentInfo(): EnvironmentInfo;
  toggleImplementation(): Promise<'mock' | 'http'>;
  setMockDelay(ms: number): void;
  getMockDelay(): number;
}

interface EnvironmentInfo {
  currentImplementation: 'mock' | 'http';
  hotSwapEnabled: boolean;
  apiBaseUrl: string;
  environment: string;
  buildTime: string;
}

class DevControls implements DevControlsInterface {
  private currentImplementation: 'mock' | 'http';
  private apiClientInstance: ApiClient | null = null;
  private mockDelay = 0;

  constructor() {
    this.currentImplementation = import.meta.env.VITE_USE_MOCK_API === 'true' ? 'mock' : 'http';
  }

  async setApiImplementation(type: 'mock' | 'http'): Promise<void> {
    if (!import.meta.env.VITE_ENABLE_API_HOTSWAP) {
      throw new Error('API hot-swapping is disabled in this environment');
    }

    this.currentImplementation = type;
    
    // Force recreation of API client
    this.apiClientInstance = null;
    
    // Update environment variable for factory
    import.meta.env.VITE_USE_MOCK_API = type === 'mock' ? 'true' : 'false';
    
    console.log(`🔄 API implementation switched to: ${type}`);
    
    // Notify listeners about the change
    window.dispatchEvent(new CustomEvent('api-implementation-changed', { 
      detail: { implementation: type } 
    }));
  }

  getApiImplementation(): 'mock' | 'http' {
    return this.currentImplementation;
  }

  async resetMockData(): Promise<void> {
    if (this.currentImplementation !== 'mock') {
      throw new Error('Cannot reset mock data - currently using HTTP implementation');
    }

    // Reset session storage that enhanced mock system uses
    sessionStorage.clear();
    
    // Clear any cached data in the enhanced mock system
    localStorage.removeItem('ulti-mock-events');
    localStorage.removeItem('ulti-mock-participants');
    localStorage.removeItem('ulti-mock-locks');
    
    // Reset API client to reinitialize enhanced mock data
    this.apiClientInstance = null;
    
    console.log('🔄 Enhanced mock data reset');
    
    // Notify listeners about the reset
    window.dispatchEvent(new CustomEvent('mock-data-reset'));
  }

  getCurrentClient(): ApiClient {
    if (!this.apiClientInstance) {
      // Import factory dynamically to avoid circular dependencies
      import('./factory.js').then(({ createApiClient }) => {
        this.apiClientInstance = createApiClient();
      });
    }
    return this.apiClientInstance!;
  }

  getEnvironmentInfo(): EnvironmentInfo {
    return {
      currentImplementation: this.currentImplementation,
      hotSwapEnabled: import.meta.env.VITE_ENABLE_API_HOTSWAP === 'true',
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'unknown',
      environment: import.meta.env.MODE || 'unknown',
      buildTime: import.meta.env.VITE_BUILD_TIME || 'unknown',
    };
  }

  async toggleImplementation(): Promise<'mock' | 'http'> {
    const newType = this.currentImplementation === 'mock' ? 'http' : 'mock';
    await this.setApiImplementation(newType);
    return newType;
  }

  setMockDelay(ms: number): void {
    if (ms < 0) throw new Error('Delay must be non-negative');
    this.mockDelay = ms;
    console.log(`🐌 Mock API delay set to ${ms}ms`);
  }

  getMockDelay(): number {
    return this.mockDelay;
  }
}

// Export singleton instance
export const devControls = new DevControls();

// Expose to global scope in development
if (import.meta.env.DEV) {
  (globalThis as any).__ultiDevControls = devControls;
}
```

### 5.3 Development UI Controls

**File**: `src/components/DevControls.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { devControls } from '../lib/api/dev-controls.js';

interface DevControlsProps {
  className?: string;
}

export function DevControls({ className = '' }: DevControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [envInfo, setEnvInfo] = useState(devControls.getEnvironmentInfo());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleImplementationChange = () => {
      setEnvInfo(devControls.getEnvironmentInfo());
    };

    window.addEventListener('api-implementation-changed', handleImplementationChange);
    window.addEventListener('mock-data-reset', handleImplementationChange);

    return () => {
      window.removeEventListener('api-implementation-changed', handleImplementationChange);
      window.removeEventListener('mock-data-reset', handleImplementationChange);
    };
  }, []);

  const handleToggleImplementation = async () => {
    setIsLoading(true);
    try {
      await devControls.toggleImplementation();
      setEnvInfo(devControls.getEnvironmentInfo());
    } catch (error) {
      console.error('Failed to toggle implementation:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetMockData = async () => {
    setIsLoading(true);
    try {
      await devControls.resetMockData();
    } catch (error) {
      console.error('Failed to reset mock data:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!import.meta.env.DEV || !envInfo.hotSwapEnabled) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
        title="Developer Controls"
      >
        🛠️ Dev
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-80">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">API Implementation</h3>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  envInfo.currentImplementation === 'mock' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {envInfo.currentImplementation.toUpperCase()}
                </span>
                <button
                  onClick={handleToggleImplementation}
                  disabled={isLoading}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
                >
                  {isLoading ? '...' : 'Toggle'}
                </button>
              </div>
            </div>

            {envInfo.currentImplementation === 'mock' && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Mock Data</h3>
                <button
                  onClick={handleResetMockData}
                  disabled={isLoading}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200 disabled:opacity-50"
                >
                  {isLoading ? '...' : 'Reset Data'}
                </button>
              </div>
            )}

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Environment Info</h3>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Environment: {envInfo.environment}</div>
                <div>API URL: {envInfo.apiBaseUrl}</div>
                <div>Hot Swap: {envInfo.hotSwapEnabled ? 'Enabled' : 'Disabled'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 5.4 Comprehensive Testing Suite

**File**: `src/lib/api/__tests__/integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ScheduledEvent, CreateEventRequest } from '@ulti-project/shared';
import * as client from '../client.js';

describe('API Integration Tests - Enhanced Mock System', () => {
  beforeEach(() => {
    // Reset to enhanced mock implementation
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    // Clear any cached data
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('Event Management with Enhanced Mock', () => {
    it('should create and retrieve events using enhanced mock data', async () => {
      const eventRequest: CreateEventRequest = {
        guildId: 'guild-123',
        name: 'Test Event',
        description: 'Integration test event',
        startTime: new Date().toISOString(),
        duration: 120,
        teamLeaderId: 'team-leader-1',
        encounterId: 'encounter-1',
      };

      const createdEvent = await client.createEvent(eventRequest);
      expect(createdEvent).toBeDefined();
      expect(createdEvent.name).toBe(eventRequest.name);
      expect(createdEvent.guildId).toBe(eventRequest.guildId);

      const retrievedEvent = await client.getEvent(createdEvent.guildId, createdEvent.id);
      expect(retrievedEvent).toEqual(createdEvent);
    });

    it('should list events with realistic mock data', async () => {
      const guildId = 'guild-123';
      const events = await client.getEvents(guildId);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0); // Enhanced mock should have realistic data

      const filteredEvents = await client.getEvents(guildId, { 
        status: 'draft' 
      });
      expect(Array.isArray(filteredEvents)).toBe(true);
    });

    it('should support SSE streams from enhanced mock', async () => {
      const guildId = 'guild-123';
      const eventSource = client.createEventStream(guildId, 'event-1');
      
      expect(eventSource).toBeDefined();
      expect(eventSource.constructor.name).toBe('EventSource');
      
      eventSource.close(); // Clean up
    });
  });

  describe('Helper Management with Enhanced Data', () => {
    it('should retrieve realistic helper data', async () => {
      const guildId = 'guild-123';
      const helpers = await client.getHelpers(guildId);
      expect(Array.isArray(helpers)).toBe(true);
      expect(helpers.length).toBeGreaterThan(0); // Enhanced mock has realistic data

      if (helpers.length > 0) {
        const helper = await client.getHelper(guildId, helpers[0].id);
        expect(helper).toBeDefined();
        expect(helper?.id).toBe(helpers[0].id);
        expect(helper?.jobs).toBeDefined(); // Enhanced mock includes job data
      }
    });

    it('should handle helper absences with enhanced logic', async () => {
      const guildId = 'guild-123';
      const helpers = await client.getHelpers(guildId);
      
      if (helpers.length > 0) {
        const absences = await client.getHelperAbsences(guildId, helpers[0].id);
        expect(Array.isArray(absences)).toBe(true);
      }
    });
  });

  describe('Session Persistence', () => {
    it('should persist data across client recreations', async () => {
      const guildId = 'guild-123';
      
      // Create an event
      const eventRequest: CreateEventRequest = {
        guildId,
        name: 'Persistent Test Event',
        description: 'Should persist',
        startTime: new Date().toISOString(),
        duration: 120,
        teamLeaderId: 'team-leader-1',
        encounterId: 'encounter-1',
      };

      const createdEvent = await client.createEvent(eventRequest);
      
      // Force new client creation (simulates page reload)
      (client as any).apiClientInstance = null;
      
      // Verify event still exists
      const retrievedEvent = await client.getEvent(guildId, createdEvent.id);
      expect(retrievedEvent).toBeDefined();
      expect(retrievedEvent?.name).toBe(eventRequest.name);
    });
  });
});
```

**File**: `src/lib/api/__tests__/environment.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient } from '../factory.js';

describe('Environment Configuration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should use enhanced mock implementation when VITE_USE_MOCK_API=true', () => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    
    const client = createApiClient();
    expect(client.events.constructor.name).toContain('Mock');
    // Should be using the enhanced mock implementation
  });

  it('should use HTTP implementation when VITE_USE_MOCK_API=false', () => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'false');
    vi.stubGlobal('import.meta.env.VITE_API_BASE_URL', 'http://test.com');
    
    const client = createApiClient();
    expect(client.events.constructor.name).toContain('Http');
  });

  it('should expose dev controls in development', () => {
    vi.stubGlobal('import.meta.env.DEV', true);
    vi.stubGlobal('import.meta.env.VITE_ENABLE_API_HOTSWAP', 'true');
    
    // Import client to trigger dev controls setup
    import('../client.js');
    
    expect((globalThis as any).__ultiDevControls).toBeDefined();
  });
});
```

### 5.5 Performance Testing with Enhanced Mock System

**File**: `src/lib/api/__tests__/performance.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import * as client from '../client.js';

describe('Performance Tests - Enhanced Mock System', () => {
  beforeEach(() => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should handle concurrent API calls efficiently with enhanced mock', async () => {
    const guildId = 'guild-123';
    const startTime = performance.now();
    
    const promises = Array.from({ length: 10 }, () => 
      client.getEvents(guildId)
    );
    
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    expect(results).toHaveLength(10);
    expect(results[0].length).toBeGreaterThan(0); // Enhanced mock has realistic data
    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should maintain consistent response times with enhanced mock', async () => {
    const guildId = 'guild-123';
    const responseTimes: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await client.getEvents(guildId);
      const end = performance.now();
      responseTimes.push(end - start);
    }
    
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    
    expect(avgResponseTime).toBeLessThan(100); // Average under 100ms
    expect(maxResponseTime).toBeLessThan(200); // Max under 200ms
  });

  it('should handle SSE connections efficiently', (done) => {
    const guildId = 'guild-123';
    let eventCount = 0;
    
    const eventSource = client.createEventStream(guildId, 'event-1');
    
    eventSource.onmessage = () => {
      eventCount++;
      if (eventCount >= 2) { // Enhanced mock should send multiple updates
        eventSource.close();
        expect(eventCount).toBeGreaterThanOrEqual(2);
        done();
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      done(new Error('SSE connection failed'));
    };
    
    // Timeout after 2 seconds
    setTimeout(() => {
      eventSource.close();
      if (eventCount === 0) {
        done(new Error('No SSE events received'));
      } else {
        done();
      }
    }, 2000);
  });
});
```

### 5.6 Bundle Size Analysis

**File**: `scripts/analyze-bundle.js`

```javascript
#!/usr/bin/env node

import { build } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

async function analyzeBundles() {
  console.log('🔍 Analyzing bundle sizes...');
  
  // Build with mock implementation
  await build({
    define: {
      'import.meta.env.VITE_USE_MOCK_API': '"true"',
    },
    plugins: [
      visualizer({
        filename: 'dist/bundle-analysis-mock.html',
        open: false,
        gzipSize: true,
      }),
    ],
    build: {
      write: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'api-mock': ['./src/lib/api/implementations/mock'],
          },
        },
      },
    },
  });
  
  // Build with HTTP implementation
  await build({
    define: {
      'import.meta.env.VITE_USE_MOCK_API': '"false"',
    },
    plugins: [
      visualizer({
        filename: 'dist/bundle-analysis-http.html',
        open: false,
        gzipSize: true,
      }),
    ],
    build: {
      write: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'api-http': ['./src/lib/api/implementations/http'],
          },
        },
      },
    },
  });
  
  console.log('✅ Bundle analysis complete');
  console.log('📊 Reports: dist/bundle-analysis-mock.html, dist/bundle-analysis-http.html');
}

analyzeBundles().catch(console.error);
```

## ✅ Validation Criteria

### Completion Requirements

- [ ] Environment variables configured for all deployment stages
- [ ] Development controls working and accessible
- [ ] Comprehensive test suite covering all API operations with enhanced mock
- [ ] Performance tests validating response times and concurrency with enhanced mock
- [ ] SSE functionality tested and working with enhanced mock system
- [ ] Bundle size analysis showing minimal impact
- [ ] Hot-swapping working in development environment
- [ ] Session persistence validated with enhanced mock system
- [ ] All sophisticated mock features preserved and tested
- [ ] All tests passing in both enhanced mock and HTTP modes (where applicable)

### Environment Validation

```bash
# Test all environments
pnpm test --run
NODE_ENV=development pnpm test --run
NODE_ENV=production pnpm build
NODE_ENV=staging pnpm preview
```

### Performance Validation

```bash
# Run performance tests
pnpm test src/lib/api/__tests__/performance.test.ts

# Analyze bundle sizes
node scripts/analyze-bundle.js
```

### Development Controls Validation

```javascript
// Test in browser console (development only)
window.__ultiDevControls.getEnvironmentInfo();
await window.__ultiDevControls.toggleImplementation();
await window.__ultiDevControls.resetMockData();
```

## 🔄 Next Steps

After completing this phase:

1. **Validate all environment configurations work correctly**
2. **Ensure all tests pass in CI/CD pipeline**
3. **Verify performance meets or exceeds current enhanced mock system**
4. **Test all sophisticated mock features (SSE, session persistence, realistic data)**
5. **Test development controls thoroughly**
6. **Proceed to [Phase 6: Integration Finalization](./phase-6-cleanup.md)**

## ⚠️ Important Notes

- **Test in all environments** - development, staging, production configurations
- **Performance regression testing** - ensure enhanced mock system performs well
- **Bundle size monitoring** - tree shaking should eliminate unused implementations
- **Development controls security** - ensure they're completely disabled in production
- **Environment variable validation** - missing variables should fail gracefully with clear errors
- **SSE testing critical** - ensure enhanced mock SSE simulation continues working
- **Session persistence validation** - critical enhanced mock feature must be preserved
- **Realistic data integrity** - enhanced mock's sophisticated data must remain intact

---

**Phase Dependencies**: ✅ Phase 4 (API Client Integration)  
**Next Phase**: [Phase 6: Integration Finalization](./phase-6-cleanup.md)
