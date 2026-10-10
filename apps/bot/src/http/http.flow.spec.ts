import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Module,
  Post,
} from '@nestjs/common';
import { test as base, describe, expect } from 'vitest';
import { fresh } from '../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../test-utils/flow-app.js';
import { BOARD_CSP, boardStaticModules } from './board-static.js';
import { BoardHttpError } from './http-exception.filter.js';

/** Test-only routes that fail the ways a real route can. */
@Controller('test-routes')
class TestRoutesController {
  @Get('unexpected')
  unexpected(): never {
    throw new Error('the database fell over');
  }

  @Get('expected')
  expected(): never {
    throw new BoardHttpError(HttpStatus.CONFLICT, {
      reason: 'claimed',
      claim: {
        squadId: 'squad-a',
        claimedBy: 'lead-a',
        claimedAt: '2026-10-08T12:00:00.000Z',
      },
    });
  }

  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

@Module({ controllers: [TestRoutesController] })
class TestRoutesModule {}

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(
    () => createFlowApp({ http: true, modules: [TestRoutesModule] }),
    (flow) => flow.close(),
  ),
});

describe('when the board API is asked for its health', () => {
  it('reports that it is up and connected to Discord', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/health');

    expect({ status, body }).toEqual({
      status: 200,
      body: { status: 'ok', discord: true },
    });
  });
});

describe('when the bot has lost its Discord gateway connection', () => {
  it('reports that it is up but not connected to Discord', async ({ flow }) => {
    flow.discord.disconnectGateway();

    const { status, body } = await flow.http.get('/api/health');

    expect({ status, body }).toEqual({
      status: 200,
      body: { status: 'ok', discord: false },
    });
  });
});

describe('when a request body is not valid JSON', () => {
  it('answers 400 invalid-json', async ({ flow }) => {
    const { status, body } = await flow.http
      .post('/api/test-routes/echo')
      .set('Content-Type', 'application/json')
      .send('{"claimedBy": ');

    expect({ status, body }).toEqual({
      status: 400,
      body: { reason: 'invalid-json' },
    });
  });
});

describe('when a request body is larger than the API accepts', () => {
  it('answers 413 payload-too-large', async ({ flow }) => {
    const { status, body } = await flow.http
      .post('/api/test-routes/echo')
      .set('Content-Type', 'application/json')
      .send({ note: 'x'.repeat(200_000) });

    expect({ status, body }).toEqual({
      status: 413,
      body: { reason: 'payload-too-large' },
    });
  });
});

describe('when a request body is in a charset the API does not read', () => {
  it('answers 415 unsupported-media-type', async ({ flow }) => {
    const { status, body } = await flow.http
      .post('/api/test-routes/echo')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');

    expect({ status, body }).toEqual({
      status: 415,
      body: { reason: 'unsupported-media-type' },
    });
  });
});

describe('when a route does not exist', () => {
  it('answers 404 not-found', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/nope');

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });
});

describe('when a route refuses a request with a reason', () => {
  it('answers with its status and reason', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/test-routes/expected');

    expect({ status, body }).toEqual({
      status: 409,
      body: {
        reason: 'claimed',
        claim: {
          squadId: 'squad-a',
          claimedBy: 'lead-a',
          claimedAt: '2026-10-08T12:00:00.000Z',
        },
      },
    });
  });
});

describe('when a route fails unexpectedly', () => {
  it('answers 500 internal and reports the error', async ({ flow }) => {
    const { status, body } = await flow.http.get('/api/test-routes/unexpected');

    expect({ status, body }).toEqual({
      status: 500,
      body: { reason: 'internal' },
    });
    flow.expectReported(/^Sentry exception: Error: the database fell over/);
    flow.expectReported(
      /^error: \{\n\s+err: Error: the database fell over.*Error: HTTP request failed/s,
    );
  });
});

const BOARD_INDEX = '<!doctype html><title>board</title>';

const boardIt = base.extend<{ board: { dir: string; flow: HttpFlowApp } }>({
  board: fresh(
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'board-'));
      await mkdir(join(dir, 'assets'));
      await writeFile(join(dir, 'index.html'), BOARD_INDEX);
      await writeFile(join(dir, 'assets', 'app.js'), 'export {};');
      const flow = await createFlowApp({
        http: true,
        modules: boardStaticModules(dir),
      });
      return { dir, flow };
    },
    async ({ dir, flow }) => {
      try {
        await flow.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  ),
});

describe("when the board's static files are served", () => {
  boardIt('answers a client route with index.html', async ({ board }) => {
    const response = await board.flow.http.get('/events/some-event?enc=FRU');

    expect({
      status: response.status,
      type: response.type,
      body: response.text,
    }).toEqual({ status: 200, type: 'text/html', body: BOARD_INDEX });
  });

  boardIt('answers a built asset with its file', async ({ board }) => {
    const { status, text } = await board.flow.http.get('/assets/app.js');

    expect({ status, text }).toEqual({ status: 200, text: 'export {};' });
  });

  boardIt('leaves an unknown API route a JSON 404', async ({ board }) => {
    const { status, body } = await board.flow.http.get('/api/unknown');

    expect({ status, body }).toEqual({
      status: 404,
      body: { reason: 'not-found' },
    });
  });

  boardIt('sends index.html uncached', async ({ board }) => {
    const root = await board.flow.http.get('/');
    const clientRoute = await board.flow.http.get('/events/some-event');

    expect([
      root.headers['cache-control'],
      clientRoute.headers['cache-control'],
    ]).toEqual(['no-cache', 'no-cache']);
  });

  boardIt('caches a built asset for a year', async ({ board }) => {
    const { headers } = await board.flow.http.get('/assets/app.js');

    expect(headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  boardIt('sends the board Content Security Policy', async ({ board }) => {
    const { headers } = await board.flow.http.get('/events/some-event');

    expect(headers['content-security-policy']).toBe(BOARD_CSP);
  });
});
