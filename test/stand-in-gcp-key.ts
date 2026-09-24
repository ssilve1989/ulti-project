import { generateKeyPairSync } from 'node:crypto';

/**
 * A throwaway RSA key standing in for the Google service account's. The auth
 * client signs a JWT before its (replayed) token request, so it must be a real
 * key. Setup files re-run for every spec file, but this module is evaluated
 * once per worker (the suite runs with `isolate: false`).
 */
export const STAND_IN_GCP_PRIVATE_KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
