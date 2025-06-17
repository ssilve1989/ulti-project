# Phase 5: Environment Configuration & Testing

**Duration**: 1-2 days  
**Complexity**: Medium  
**Dependencies**: Phase 4 (API Client Update)

## 🎯 Phase Goals

Finalize environment-based configuration, implement comprehensive testing, and add enhanced development controls for seamless switching between mock and HTTP implementations.

## 📋 Context

At this phase, we have:

- ✅ API interfaces defined (Phase 1)
- ✅ Mock implementations working (Phase 2)
- ✅ HTTP stubs created (Phase 3)
- ✅ New API client in place (Phase 4)
- 🎯 Need comprehensive testing and environment configuration

This phase will:

- Configure environment variables for all deployment stages
- Implement comprehensive testing suite
- Add enhanced development controls
- Validate performance and functionality
- Prepare for production deployment

## 🔧 Implementation Steps

### 5.1 Environment Configuration

**File**: `astro.config.mjs` (update existing)

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
      'import.meta.env.VITE_ENABLE_API_HOTSWAP': JSON.stringify(process.env.VITE_ENABLE_API_HOTSWAP || 'false'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:3000'),
    },
    
    // Optimize bundle splitting for API implementations
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'api-mock': ['./src/lib/api/implementations/mock'],
            'api-http': ['./src/lib/api/implementations/http'],
          },
        },
      },
    },
  },
});
```

**File**: `.env` (base environment file)

```env
# Default values for all environments
VITE_USE_MOCK_API=true
VITE_ENABLE_API_HOTSWAP=false
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT=10000
```

**File**: `.env.development`

```env
# Development environment
VITE_USE_MOCK_API=true
VITE_ENABLE_API_HOTSWAP=true
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT=5000
VITE_LOG_LEVEL=debug
```

**File**: `.env.production`

```env
# Production environment
VITE_USE_MOCK_API=false
VITE_ENABLE_API_HOTSWAP=false
VITE_API_TIMEOUT=30000
VITE_LOG_LEVEL=error
# VITE_API_BASE_URL and VITE_API_TOKEN will be set by deployment system
```

**File**: `.env.test`

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

    // Clear session storage
    sessionStorage.clear();
    
    // Reset API client to reinitialize mock data
    this.apiClientInstance = null;
    
    console.log('🔄 Mock data reset');
    
    // Notify listeners
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

describe('API Integration Tests', () => {
  beforeEach(() => {
    // Reset to mock implementation
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
  });

  describe('Event Management', () => {
    it('should create and retrieve events', async () => {
      const eventRequest: CreateEventRequest = {
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

      const retrievedEvent = await client.getEvent(createdEvent.id);
      expect(retrievedEvent).toEqual(createdEvent);
    });

    it('should list events with filters', async () => {
      const events = await client.getEvents();
      expect(Array.isArray(events)).toBe(true);

      const filteredEvents = await client.getEvents({ 
        status: 'draft' 
      });
      expect(Array.isArray(filteredEvents)).toBe(true);
    });
  });

  describe('Helper Management', () => {
    it('should retrieve helpers and their data', async () => {
      const helpers = await client.getHelpers();
      expect(Array.isArray(helpers)).toBe(true);

      if (helpers.length > 0) {
        const helper = await client.getHelper(helpers[0].id);
        expect(helper).toBeDefined();
        expect(helper?.id).toBe(helpers[0].id);
      }
    });
  });

  describe('Roster Management', () => {
    it('should manage participant assignments', async () => {
      const events = await client.getEvents();
      const helpers = await client.getHelpers();

      if (events.length > 0 && helpers.length > 0) {
        const assignRequest = {
          eventId: events[0].id,
          helperId: helpers[0].id,
          role: 'Tank' as const,
          teamLeaderId: 'team-leader-1',
        };

        const participant = await client.assignParticipant(assignRequest);
        expect(participant.eventId).toBe(assignRequest.eventId);
        expect(participant.helperId).toBe(assignRequest.helperId);

        const participants = await client.getEventParticipants(events[0].id);
        expect(participants.some(p => p.id === participant.id)).toBe(true);
      }
    });
  });

  describe('Lock Management', () => {
    it('should create and manage draft locks', async () => {
      const events = await client.getEvents();
      const helpers = await client.getHelpers();

      if (events.length > 0 && helpers.length > 0) {
        const lockRequest = {
          eventId: events[0].id,
          helperId: helpers[0].id,
          teamLeaderId: 'team-leader-1',
        };

        const lock = await client.lockParticipant(lockRequest);
        expect(lock.eventId).toBe(lockRequest.eventId);
        expect(lock.helperId).toBe(lockRequest.helperId);

        const locks = await client.getEventLocks(events[0].id);
        expect(locks.some(l => l.id === lock.id)).toBe(true);
      }
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

  it('should use mock implementation when VITE_USE_MOCK_API=true', () => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
    
    const client = createApiClient();
    expect(client.events.constructor.name).toContain('Mock');
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

### 5.5 Performance Testing

**File**: `src/lib/api/__tests__/performance.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import * as client from '../client.js';

describe('Performance Tests', () => {
  beforeEach(() => {
    vi.stubGlobal('import.meta.env.VITE_USE_MOCK_API', 'true');
  });

  it('should handle concurrent API calls efficiently', async () => {
    const startTime = performance.now();
    
    const promises = Array.from({ length: 10 }, () => 
      client.getEvents()
    );
    
    const results = await Promise.all(promises);
    const endTime = performance.now();
    
    expect(results).toHaveLength(10);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should maintain consistent response times', async () => {
    const responseTimes: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await client.getEvents();
      const end = performance.now();
      responseTimes.push(end - start);
    }
    
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    
    expect(avgResponseTime).toBeLessThan(100); // Average under 100ms
    expect(maxResponseTime).toBeLessThan(200); // Max under 200ms
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
- [ ] Comprehensive test suite covering all API operations
- [ ] Performance tests validating response times and concurrency
- [ ] Bundle size analysis showing minimal impact
- [ ] Hot-swapping working in development environment
- [ ] All tests passing in both mock and HTTP modes (where applicable)

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
3. **Verify performance meets or exceeds current implementation**
4. **Test development controls thoroughly**
5. **Proceed to [Phase 6: Legacy Cleanup](./phase-6-cleanup.md)**

## ⚠️ Important Notes

- **Test in all environments** - development, staging, production configurations
- **Performance regression testing** - ensure new system doesn't slow down the application
- **Bundle size monitoring** - tree shaking should eliminate unused implementations
- **Development controls security** - ensure they're completely disabled in production
- **Environment variable validation** - missing variables should fail gracefully with clear errors

---

**Phase Dependencies**: ✅ Phase 4 (API Client Update)  
**Next Phase**: [Phase 6: Legacy Cleanup](./phase-6-cleanup.md)
