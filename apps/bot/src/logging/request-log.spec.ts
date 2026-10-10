import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { pinoHttp } from 'pino-http';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requestLogOptions } from './request-log.js';

/** Serves one request that answers `status` and sets a cookie, logging it with the bot's options at `debug`; returns the logged entry. */
async function logOfRequest(
  status: number,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  // a stream in place of the pretty-printing transport, to read what's logged
  const logger = pinoHttp(
    { ...requestLogOptions, transport: undefined, level: 'debug' },
    { write: (line: string) => lines.push(line) },
  );
  const server = createServer((request, response) => {
    logger(request, response);
    response.statusCode = status;
    response.setHeader('set-cookie', 'session=server-set-secret');
    response.end();
  });
  await supertest(server).get('/api/events?x=1').set(headers);
  await vi.waitFor(() => expect(lines).toHaveLength(1));
  return JSON.parse(lines.join(''));
}

describe('when the bot logs a request', () => {
  it('logs its method, path, status and duration, and no headers', async () => {
    const entry = await logOfRequest(200, {
      Cookie: 'session=client-sent-secret',
      Authorization: 'Bearer token-secret',
    });

    expect(entry).toEqual({
      level: 20,
      time: expect.any(Number),
      pid: process.pid,
      hostname: hostname(),
      req: { method: 'GET', url: '/api/events?x=1' },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
      msg: 'request completed',
    });
  });

  it.each([
    { status: 200, level: 'debug', value: 20 },
    { status: 302, level: 'debug', value: 20 },
    { status: 404, level: 'warn', value: 40 },
    { status: 503, level: 'error', value: 50 },
  ])('logs a $status at $level', async ({ status, value }) => {
    expect((await logOfRequest(status)).level).toEqual(value);
  });
});
