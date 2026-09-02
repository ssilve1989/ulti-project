export interface FirestoreEnv {
  GCP_PROJECT_ID: string;
  GCP_SERVICE_ACCOUNT_EMAIL?: string;
  GCP_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  FIRESTORE_EMULATOR_HOST?: string;
}

export interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
}

export interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface StructuredQuery {
  from: Array<{ collectionId: string }>;
  where?: unknown;
  limit?: number;
}

function decodeValue(value: FirestoreValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  return undefined;
}

export function decodeFields(
  doc: FirestoreRestDocument,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    out[key] = decodeValue(value);
  }
  return out;
}

export function documentId(doc: FirestoreRestDocument): string {
  const segments = doc.name.split('/');
  return segments[segments.length - 1] ?? '';
}

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

export class UpstreamError extends Error {}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function resetAccessTokenCache(): void {
  cachedToken = null;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJwt(
  claim: Record<string, unknown>,
  privateKeyPem: string,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(claim),
  )}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64url(signature)}`;
}

export async function getAccessToken(env: FirestoreEnv): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const email = env.GCP_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !privateKey) {
    throw new Error('missing GCP service account credentials');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: email,
      scope: DATASTORE_SCOPE,
      aud: TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    },
    privateKey,
  );

  const response = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new UpstreamError(`token exchange failed: ${response.status}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}
