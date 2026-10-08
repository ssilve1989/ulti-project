import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { test as base, describe, expect } from 'vitest';
import { fresh } from '../test-utils/fixtures.js';
import { createFlowApp, type HttpFlowApp } from '../test-utils/flow-app.js';
import { BoardHttpError } from './http-exception.filter.js';

/** Test-only routes that fail the ways a real route can. */
@Controller('test-failures')
class FailingController {
  @Get('unexpected')
  unexpected(): never {
    throw new Error('the database fell over');
  }

  @Get('expected')
  expected(): never {
    throw new BoardHttpError(HttpStatus.CONFLICT, 'already-claimed', {
      claimedBy: 'squad-a',
    });
  }
}

@Module({ controllers: [FailingController] })
class FailingModule {}

const it = base.extend<{ flow: HttpFlowApp }>({
  flow: fresh(
    () => createFlowApp({ http: true, modules: [FailingModule] }),
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
    const { status, body } = await flow.http.get('/api/test-failures/expected');

    expect({ status, body }).toEqual({
      status: 409,
      body: { reason: 'already-claimed', claimedBy: 'squad-a' },
    });
  });
});

describe('when a route fails unexpectedly', () => {
  it('answers 500 internal and reports the error', async ({ flow }) => {
    const { status, body } = await flow.http.get(
      '/api/test-failures/unexpected',
    );

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
