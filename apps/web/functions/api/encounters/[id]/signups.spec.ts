import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirestoreEnv } from '../../../lib/firestore-client.ts';

vi.mock('../../../lib/firestore-client.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../lib/firestore-client.ts')>();
  return { ...actual, runQuery: vi.fn(), getDocument: vi.fn() };
});

const { runQuery, getDocument, UpstreamError } = await import(
  '../../../lib/firestore-client.ts'
);
const { onRequestGet } = await import('./signups.ts');

const runQueryMock = vi.mocked(runQuery);
const getDocumentMock = vi.mocked(getDocument);

function makeContext(id: string, env: Partial<FirestoreEnv> = {}) {
  return {
    request: new Request(`https://web.ulti/api/encounters/${id}/signups`),
    env: { GCP_PROJECT_ID: 'test-project', ...env },
    params: { id },
    waitUntil: vi.fn(),
  } as unknown as Parameters<typeof onRequestGet>[0];
}

function signupDoc(overrides: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    character: 'Char',
    world: 'World',
    role: 'DPS',
    progPoint: 'P4',
    partyStatus: 'Prog Party',
    discordId: 'secret-discord-id',
    reviewedBy: 'secret-reviewer',
    declineReason: 'secret-reason',
    status: 'APPROVED',
  };
  const merged = { ...base, ...overrides };
  return {
    name: `projects/p/databases/(default)/documents/signups/${merged.character}`,
    fields: Object.fromEntries(
      Object.entries(merged).map(([k, v]) => [k, { stringValue: String(v) }]),
    ),
  };
}

describe('GET /api/encounters/:id/signups', () => {
  beforeEach(() => {
    runQueryMock.mockReset();
    getDocumentMock.mockReset();
    vi.stubGlobal('caches', {
      default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 404 (uncached) when the encounter does not exist', async () => {
    getDocumentMock.mockResolvedValue(null);

    const context = makeContext('NOPE');
    const response = await onRequestGet(context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'encounter not found' });
    expect(runQueryMock).not.toHaveBeenCalled();
    expect(context.waitUntil).not.toHaveBeenCalled();
  });

  it('queries approved signups, excludes Cleared, and redacts the rest', async () => {
    getDocumentMock.mockResolvedValue({
      name: 'projects/p/databases/(default)/documents/encounters/FRU',
    });
    runQueryMock.mockResolvedValue([
      signupDoc({ character: 'Progger', partyStatus: 'Prog Party' }),
      signupDoc({ character: 'Clearer', partyStatus: 'Clear Party' }),
      signupDoc({ character: 'Done', partyStatus: 'Cleared' }),
    ]);

    const response = await onRequestGet(makeContext('FRU'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body.map((s) => s.character)).toEqual(['Progger', 'Clearer']);
    for (const entry of body) {
      expect(Object.keys(entry).sort()).toEqual([
        'character',
        'partyStatus',
        'progPoint',
        'role',
        'world',
      ]);
    }

    expect(runQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ GCP_PROJECT_ID: 'test-project' }),
      {
        from: [{ collectionId: 'signups' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'encounter' },
                  op: 'EQUAL',
                  value: { stringValue: 'FRU' },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op: 'EQUAL',
                  value: { stringValue: 'APPROVED' },
                },
              },
            ],
          },
        },
      },
    );
  });

  it('returns an empty array when no approved signups match', async () => {
    getDocumentMock.mockResolvedValue({
      name: 'projects/p/databases/(default)/documents/encounters/FRU',
    });
    runQueryMock.mockResolvedValue([]);

    const response = await onRequestGet(makeContext('FRU'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('returns 502 when the signups query fails', async () => {
    getDocumentMock.mockResolvedValue({
      name: 'projects/p/databases/(default)/documents/encounters/FRU',
    });
    runQueryMock.mockRejectedValue(new UpstreamError('down'));

    const response = await onRequestGet(makeContext('FRU'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream unavailable' });
  });

  it('returns 502 when the encounter lookup fails', async () => {
    getDocumentMock.mockRejectedValue(new UpstreamError('down'));

    const response = await onRequestGet(makeContext('FRU'));

    expect(response.status).toBe(502);
  });
});
