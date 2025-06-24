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