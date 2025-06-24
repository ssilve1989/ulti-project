import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiFactory, createDefaultConfig } from '../factory.js';

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