import { createServer } from 'node:http';
import { pinoHttp } from 'pino-http';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requestLogOptions } from './request-log.js';

/** Serves one request that sets a cookie, logging it with the bot's options; returns the logged line. */
async function logOfRequest(headers: Record<string, string>): Promise<string> {
  const lines: string[] = [];
  // a stream in place of the pretty-printing transport, to read what's logged
  const logger = pinoHttp(
    { ...requestLogOptions, transport: undefined },
    { write: (line: string) => lines.push(line) },
  );
  const server = createServer((request, response) => {
    logger(request, response);
    response.setHeader('set-cookie', 'session=server-set-secret');
    response.end();
  });
  await supertest(server).get('/').set(headers);
  await vi.waitFor(() => expect(lines).toHaveLength(1));
  return lines.join('');
}

describe('when the bot logs a request carrying credentials', () => {
  it('logs none of them', async () => {
    const line = await logOfRequest({
      Cookie: 'session=client-sent-secret',
      Authorization: 'Bearer token-secret',
    });

    expect(line.match(/[\w-]*secret/g)).toEqual(null);
  });

  it('marks where they were redacted', async () => {
    const line = await logOfRequest({
      Cookie: 'session=client-sent-secret',
      Authorization: 'Bearer token-secret',
    });

    expect(line.match(/"[\w-]+":"\[Redacted\]"/g)).toEqual([
      '"cookie":"[Redacted]"',
      '"authorization":"[Redacted]"',
      '"set-cookie":"[Redacted]"',
    ]);
  });
});
