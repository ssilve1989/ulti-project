import { createAuthClient } from 'better-auth/client';

// Use relative URL in development to leverage the proxy, absolute URL in production
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use relative URL to leverage the proxy
    return '';
  }
  // Server-side: use absolute URL for SSR
  return process.env.NODE_ENV === 'production'
    ? 'https://your-api-domain.com'
    : 'http://localhost:3000';
};

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  fetchOptions: {
    credentials: 'include',
  },
});
