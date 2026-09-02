import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeFields,
  documentId,
  type FirestoreRestDocument,
  getAccessToken,
  resetAccessTokenCache,
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
