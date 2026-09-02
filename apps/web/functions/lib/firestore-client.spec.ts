import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeFields,
  documentId,
  type FirestoreRestDocument,
  getAccessToken,
  getDocument,
  resetAccessTokenCache,
  runQuery,
  UpstreamError,
} from './firestore-client.ts';

describe('decodeFields', () => {
  it('decodes each Firestore typed value to a plain JS value', () => {
    const doc: FirestoreRestDocument = {
      name: 'projects/p/databases/(default)/documents/signups/abc',
      fields: {
        character: { stringValue: 'Kholi Ruz' },
        active: { booleanValue: true },
        order: { integerValue: '5' },
        threshold: { doubleValue: 1.5 },
        notes: { nullValue: null },
        tags: {
          arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] },
        },
      },
    };

    expect(decodeFields(doc)).toEqual({
      character: 'Kholi Ruz',
      active: true,
      order: 5,
      threshold: 1.5,
      notes: null,
      tags: ['a', 'b'],
    });
  });

  it('returns an empty object when the document has no fields', () => {
    expect(decodeFields({ name: 'x/y' })).toEqual({});
  });
});

describe('documentId', () => {
  it('returns the last path segment of the document name', () => {
    expect(
      documentId({
        name: 'projects/p/databases/(default)/documents/encounters/FRU',
      }),
    ).toBe('FRU');
  });
});

// Generates a real RSA key with Web Crypto so signing runs for real in tests.
async function makePrivateKeyPem(): Promise<{
  pem: string;
  publicKey: CryptoKey;
}> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  if (!('privateKey' in pair)) {
    throw new Error('expected an RSA key pair');
  }
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  if (!(pkcs8 instanceof ArrayBuffer)) {
    throw new Error('expected a pkcs8 ArrayBuffer');
  }
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const wrapped = b64.replace(/(.{64})/g, '$1\n');
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

describe('getAccessToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetAccessTokenCache();
    fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'tok-123', expires_in: 3600 }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs a JWT and exchanges it for an access token', async () => {
    const { pem, publicKey } = await makePrivateKeyPem();

    const token = await getAccessToken({
      GCP_PROJECT_ID: 'proj',
      GCP_SERVICE_ACCOUNT_EMAIL: 'sa@proj.iam.gserviceaccount.com',
      GCP_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
    });

    expect(token).toBe('tok-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );

    const assertion = body.get('assertion') ?? '';
    const [headerB64, claimB64, sigB64] = assertion.split('.');
    expect(decodeJwtSegment(headerB64)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claim = decodeJwtSegment(claimB64);
    expect(claim.iss).toBe('sa@proj.iam.gserviceaccount.com');
    expect(claim.scope).toBe('https://www.googleapis.com/auth/datastore');
    expect(claim.aud).toBe('https://oauth2.googleapis.com/token');

    // Signature verifies against the public key.
    const sig = Uint8Array.from(
      atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      sig,
      new TextEncoder().encode(`${headerB64}.${claimB64}`),
    );
    expect(ok).toBe(true);
  });

  it('reuses the cached token on a second call within its lifetime', async () => {
    const { pem } = await makePrivateKeyPem();
    const env = {
      GCP_PROJECT_ID: 'proj',
      GCP_SERVICE_ACCOUNT_EMAIL: 'sa@proj.iam.gserviceaccount.com',
      GCP_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
    };

    await getAccessToken(env);
    await getAccessToken(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws UpstreamError when the token endpoint returns non-2xx', async () => {
    const { pem } = await makePrivateKeyPem();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));

    await expect(
      getAccessToken({
        GCP_PROJECT_ID: 'proj',
        GCP_SERVICE_ACCOUNT_EMAIL: 'sa@proj.iam.gserviceaccount.com',
        GCP_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
      }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws a plain Error when service-account credentials are missing', async () => {
    await expect(
      getAccessToken({ GCP_PROJECT_ID: 'proj' }),
    ).rejects.not.toBeInstanceOf(UpstreamError);
  });
});

describe('runQuery', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetAccessTokenCache();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const query = {
    from: [{ collectionId: 'encounters' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'active' },
        op: 'EQUAL',
        value: { booleanValue: true },
      },
    },
  };

  it('POSTs the structured query with a bearer token and returns documents', async () => {
    const { pem } = await makePrivateKeyPem();
    fetchMock.mockImplementation((url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({ access_token: 'tok-abc', expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          { readTime: '2026-01-01T00:00:00Z' },
          {
            document: {
              name: 'projects/p/databases/(default)/documents/encounters/FRU',
              fields: { name: { stringValue: 'FRU' } },
            },
          },
        ]),
        { status: 200 },
      );
    });

    const docs = await runQuery(
      {
        GCP_PROJECT_ID: 'p',
        GCP_SERVICE_ACCOUNT_EMAIL: 'sa@p.iam.gserviceaccount.com',
        GCP_SERVICE_ACCOUNT_PRIVATE_KEY: pem,
      },
      query,
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].name).toContain('/encounters/FRU');

    const firestoreCall = fetchMock.mock.calls.find(
      ([url]) => url !== 'https://oauth2.googleapis.com/token',
    );
    if (!firestoreCall) {
      throw new Error('expected a Firestore fetch call');
    }
    expect(firestoreCall[0]).toBe(
      'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:runQuery',
    );
    expect(firestoreCall[1].headers.Authorization).toBe('Bearer tok-abc');
    expect(JSON.parse(firestoreCall[1].body)).toEqual({
      structuredQuery: query,
    });
  });

  it('uses the emulator URL with no auth when FIRESTORE_EMULATOR_HOST is set', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await runQuery(
      { GCP_PROJECT_ID: 'p', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      query,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'http://127.0.0.1:8080/v1/projects/p/databases/(default)/documents:runQuery',
    );
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('throws UpstreamError on a non-2xx Firestore response', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }));

    await expect(
      runQuery(
        { GCP_PROJECT_ID: 'p', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
        query,
      ),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws UpstreamError when fetch itself rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));

    await expect(
      runQuery(
        { GCP_PROJECT_ID: 'p', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
        query,
      ),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('getDocument', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetAccessTokenCache();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the document on 200 (emulator)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'projects/p/databases/(default)/documents/encounters/FRU',
          fields: { name: { stringValue: 'FRU' } },
        }),
        { status: 200 },
      ),
    );

    const doc = await getDocument(
      { GCP_PROJECT_ID: 'p', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      'encounters/FRU',
    );

    expect(doc?.name).toContain('/encounters/FRU');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8080/v1/projects/p/databases/(default)/documents/encounters/FRU',
    );
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

    const doc = await getDocument(
      { GCP_PROJECT_ID: 'p', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      'encounters/NOPE',
    );

    expect(doc).toBeNull();
  });

  it('throws UpstreamError on other non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('err', { status: 500 }));

    await expect(
      getDocument(
        { GCP_PROJECT_ID: 'p', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
        'encounters/FRU',
      ),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
