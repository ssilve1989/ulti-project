// Mock API configuration
export const MOCK_CONFIG = {
  // Guild configuration
  guild: {
    // Default guild ID - can be overridden by Vite env vars
    defaultGuildId: import.meta.env.VITE_GUILD_ID || 'guild-12345-demo',
    name: 'Demo Ultimate Raid Static',
  },

  // Delays to simulate network latency
  delays: {
    fast: 20, // Quick operations like locks
    medium: 100, // Standard API calls
    slow: 500, // Complex operations like event creation
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
