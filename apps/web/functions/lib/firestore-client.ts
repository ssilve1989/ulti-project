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
}

export interface StructuredQuery {
  from: Array<{ collectionId: string }>;
  where?: unknown;
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

/** Read a string field from a decoded document, falling back when absent or non-string. */
export function getString(
  fields: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = fields[key];
  return typeof value === 'string' ? value : fallback;
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
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----|\\n|\s+/g, '');
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0)).buffer;
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
    // A plain Error (not UpstreamError): missing secrets are a deploy
    // misconfiguration → 500, not a transient upstream failure → cached 502.
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

/**
 * One network primitive for the Firestore REST API. Decides emulator-vs-production
 * (URL + whether to attach a bearer token) once, and wraps transport failures as
 * `UpstreamError`. `suffix` is appended to `.../databases/(default)/documents`
 * (e.g. `:runQuery`, `/encounters/FRU`).
 */
async function firestoreFetch(
  env: FirestoreEnv,
  suffix: string,
  init: RequestInit = {},
): Promise<Response> {
  const emulator = env.FIRESTORE_EMULATOR_HOST;
  const base = emulator
    ? `http://${emulator}`
    : 'https://firestore.googleapis.com';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (!emulator) {
    headers.Authorization = `Bearer ${await getAccessToken(env)}`;
  }

  const url = `${base}/v1/projects/${env.GCP_PROJECT_ID}/databases/(default)/documents${suffix}`;
  try {
    return await fetch(url, { ...init, headers });
  } catch (cause) {
    throw new UpstreamError('firestore request failed', { cause });
  }
}

export async function runQuery(
  env: FirestoreEnv,
  structuredQuery: StructuredQuery,
): Promise<FirestoreRestDocument[]> {
  const response = await firestoreFetch(env, ':runQuery', {
    method: 'POST',
    body: JSON.stringify({ structuredQuery }),
  });

  if (!response.ok) {
    throw new UpstreamError(`firestore runQuery returned ${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    document?: FirestoreRestDocument;
  }>;
  return rows
    .map((row) => row.document)
    .filter((doc): doc is FirestoreRestDocument => doc !== undefined);
}

export async function getDocument(
  env: FirestoreEnv,
  path: string,
): Promise<FirestoreRestDocument | null> {
  const response = await firestoreFetch(env, `/${path}`, { method: 'GET' });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new UpstreamError(
      `firestore getDocument returned ${response.status}`,
    );
  }

  return (await response.json()) as FirestoreRestDocument;
}
