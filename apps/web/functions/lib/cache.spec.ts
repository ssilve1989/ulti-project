import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { serveCached } from './cache.ts';
import { UpstreamError } from './firestore-client.ts';

describe('serveCached', () => {
  let match: Mock;
  let put: Mock;
  let waitUntil: Mock<(promise: Promise<unknown>) => void>;

  beforeEach(() => {
    match = vi.fn().mockResolvedValue(undefined);
    put = vi.fn().mockResolvedValue(undefined);
    waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    vi.stubGlobal('caches', { default: { match, put } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function context(url = 'https://web.ulti/api/encounters') {
    return { request: new Request(url), waitUntil };
  }

  it('returns the cached response without calling build on a hit', async () => {
    const cached = new Response('["cached"]', { status: 200 });
    match.mockResolvedValue(cached);
    const build = vi.fn();

    const result = await serveCached(context(), build);

    expect(result).toBe(cached);
    expect(build).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('builds, serialises, caches, and sets cache-control on a 200 miss', async () => {
    const ok = { status: 200, data: [{ id: 'FRU' }] };
    const build = vi.fn().mockResolvedValue(ok);

    const result = await serveCached(context(), build);

    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toBe('application/json');
    expect(result.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await result.text()).toBe('[{"id":"FRU"}]');
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1]).toBeInstanceOf(Response);
  });

  it('does not cache a non-200 build result (e.g. 404)', async () => {
    const notFound = { status: 404, data: { error: 'encounter not found' } };
    const build = vi.fn().mockResolvedValue(notFound);

    const result = await serveCached(context(), build);

    expect(result.status).toBe(404);
    expect(result.headers.get('cache-control')).toBeNull();
    expect(put).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('maps an UpstreamError to an uncached 502 with a generic body', async () => {
    const build = vi.fn().mockRejectedValue(new UpstreamError('firestore 503'));

    const result = await serveCached(context(), build);

    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'upstream unavailable' });
    expect(put).not.toHaveBeenCalled();
  });

  it('propagates a non-UpstreamError', async () => {
    const build = vi.fn().mockRejectedValue(new Error('bug'));

    await expect(serveCached(context(), build)).rejects.toThrow('bug');
  });
});
