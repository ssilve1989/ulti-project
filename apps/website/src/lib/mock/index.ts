// Mock API exports for scheduling system
export * from './types.js';
export * from './helpers.js';
export * from './participants.js';
export * from './drafts.js';
export * from './events.js';

// Mock API configuration
export const MOCK_CONFIG = {
  // Delays to simulate network latency
  delays: {
    fast: 100, // Quick operations like locks
    medium: 300, // Standard API calls
    slow: 800, // Complex operations like event creation
  },

  // SSE simulation intervals
  sse: {
    heartbeat: 30000, // 30 seconds
    dataUpdate: 5000, // 5 seconds
    lockExpiry: 1800000, // 30 minutes
  },

  // Draft lock timeout
  draftTimeout: 30 * 60 * 1000, // 30 minutes in milliseconds
} as const;

// Utility function to simulate API delays
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Development mode detection
export const isDevelopment = import.meta.env.DEV;
