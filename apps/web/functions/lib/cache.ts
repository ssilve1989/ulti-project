import { UpstreamError } from './firestore-client.ts';

export interface CachedResult {
  status: number;
  data: unknown;
}

export interface CacheableContext {
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
}

async function resolve(
  build: () => Promise<CachedResult>,
): Promise<CachedResult> {
  try {
    return await build();
  } catch (error) {
    if (error instanceof UpstreamError) {
      return { status: 502, data: { error: 'upstream unavailable' } };
    }
    throw error;
  }
}

export async function serveCached(
  context: CacheableContext,
  build: () => Promise<CachedResult>,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, context.request);

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const { status, data } = await resolve(build);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (status === 200) {
    headers['cache-control'] = 'public, max-age=60';
  }

  const response = new Response(JSON.stringify(data), { status, headers });

  if (status === 200) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}
