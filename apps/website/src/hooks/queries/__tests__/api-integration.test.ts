import { describe, it, expect } from 'vitest';
import { api } from '../../../lib/api/client.js';

describe('React Query API Integration', () => {
  it('should have single API instance available', () => {
    expect(api).toBeDefined();
    expect(api.events).toBeDefined();
    expect(api.helpers).toBeDefined();
    expect(api.roster).toBeDefined();
    expect(api.locks).toBeDefined();
  });

  it('should provide all expected API methods', () => {
    expect(typeof api.events.getEvents).toBe('function');
    expect(typeof api.events.createEvent).toBe('function');
    expect(typeof api.helpers.getHelpers).toBe('function');
    expect(typeof api.roster.getParticipants).toBe('function');
    expect(typeof api.locks.lockParticipant).toBe('function');
  });

  it('should use single instance across imports', async () => {
    // Import the API client multiple times to verify singleton pattern
    const { api: api1 } = await import('../../../lib/api/client.js');
    const { api: api2 } = await import('../../../lib/api/client.js');
    
    expect(api1).toBe(api2); // Same instance
  });
});