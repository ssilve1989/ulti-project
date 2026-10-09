import type { MeResponse } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { json, stubApi } from '../test-utils/api-stub';
import { meResponse } from '../test-utils/fixtures';
import { api } from './client';

describe('api', () => {
  it('returns a 200 JSON body as an ok result', async () => {
    const me = meResponse({ kind: 'viewer' });
    stubApi({ 'GET /api/me': json(200, me) });

    expect(await api<MeResponse>('/api/me')).toEqual({
      ok: true,
      status: 200,
      body: me,
    });
  });

  it('returns a 409 claimed body as a refusal carrying the winning claim', async () => {
    const path = '/api/events/event-1/participants/p-1-FRU/claim';
    const claim = {
      squadId: 'squad-space',
      claimedBy: 'lead-2',
      claimedAt: '2026-10-09T12:00:00.000Z',
    };
    stubApi({ [`POST ${path}`]: json(409, { reason: 'claimed', claim }) });

    expect(await api(path, { method: 'POST', body: '{}' })).toEqual({
      ok: false,
      status: 409,
      body: { reason: 'claimed', claim },
    });
  });

  it('treats a body that isn’t JSON, such as a proxy’s 502 page, as internal', async () => {
    stubApi({
      'GET /api/me': new Response('<h1>Bad Gateway</h1>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    });

    expect(await api('/api/me')).toEqual({
      ok: false,
      status: 502,
      body: { reason: 'internal' },
    });
  });

  it('treats a failed fetch as an internal failure with status 0', async () => {
    stubApi({
      'GET /api/me': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect(await api('/api/me')).toEqual({
      ok: false,
      status: 0,
      body: { reason: 'internal' },
    });
  });
});
