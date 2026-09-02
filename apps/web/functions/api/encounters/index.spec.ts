import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirestoreEnv } from '../../lib/firestore-client.ts';

vi.mock('../../lib/firestore-client.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/firestore-client.ts')>();
  return { ...actual, runQuery: vi.fn() };
});

const { runQuery, UpstreamError } = await import(
  '../../lib/firestore-client.ts'
);
const { onRequestGet } = await import('./index.ts');

const runQueryMock = vi.mocked(runQuery);

function makeContext(env: Partial<FirestoreEnv> = {}) {
  return {
    request: new Request('https://web.ulti/api/encounters'),
    env: { GCP_PROJECT_ID: 'test-project', ...env },
    params: {},
    waitUntil: vi.fn(),
  } as unknown as Parameters<typeof onRequestGet>[0];
}

describe('GET /api/encounters', () => {
  beforeEach(() => {
    runQueryMock.mockReset();
    vi.stubGlobal('caches', {
      default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries active encounters and maps to the public shape', async () => {
    runQueryMock.mockResolvedValue([
      {
        name: 'projects/p/databases/(default)/documents/encounters/FRU',
        fields: {
          name: { stringValue: 'Futures Rewritten' },
          description: { stringValue: 'FRU description' },
          active: { booleanValue: true },
          mode: { stringValue: 'legacy' },
          emoji: { stringValue: '1314628063782506506' },
        },
      },
    ]);

    const response = await onRequestGet(makeContext());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: 'FRU',
        name: 'Futures Rewritten',
        description: 'FRU description',
        mode: 'legacy',
        emoji: '1314628063782506506',
      },
    ]);

    expect(runQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ GCP_PROJECT_ID: 'test-project' }),
      {
        from: [{ collectionId: 'encounters' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'active' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
      },
    );
  });

  it('omits mode and emoji when absent on the document', async () => {
    runQueryMock.mockResolvedValue([
      {
        name: 'projects/p/databases/(default)/documents/encounters/DSR',
        fields: {
          name: { stringValue: 'Dragonsong Reprise' },
          description: { stringValue: 'DSR' },
          active: { booleanValue: true },
        },
      },
    ]);

    const response = await onRequestGet(makeContext());

    expect(await response.json()).toEqual([
      { id: 'DSR', name: 'Dragonsong Reprise', description: 'DSR' },
    ]);
  });

  it('returns an empty array when there are no active encounters', async () => {
    runQueryMock.mockResolvedValue([]);

    const response = await onRequestGet(makeContext());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('returns an uncached 502 when Firestore is unreachable', async () => {
    runQueryMock.mockRejectedValue(new UpstreamError('down'));

    const response = await onRequestGet(makeContext());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream unavailable' });
  });
});
