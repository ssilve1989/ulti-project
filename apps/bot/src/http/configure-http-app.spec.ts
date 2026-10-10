import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { mockOf } from '../test-utils/mock-factory.js';
import { answerBodyParserErrors } from './configure-http-app.js';

/** What the middleware did with `error`: what it answered, and what it passed on. */
function handle(error: unknown) {
  const answered: unknown[] = [];
  const response = mockOf<Response>({
    status: (status: number) => ({
      json: (body: unknown) => answered.push({ status, body }),
    }),
  });
  const next = vi.fn();
  answerBodyParserErrors(error, mockOf<Request>({}), response, next);
  return { answered, passedOn: next.mock.calls };
}

describe('answerBodyParserErrors', () => {
  it('passes on an error that is not a refused request body', () => {
    const error = new Error('the database fell over');

    expect(handle(error)).toEqual({ answered: [], passedOn: [[error]] });
  });

  it('passes on a body-parser failure that is the server’s own, not the request’s', () => {
    const error = Object.assign(new Error('stream is not readable'), {
      status: 500,
      type: 'stream.not.readable',
    });

    expect(handle(error)).toEqual({ answered: [], passedOn: [[error]] });
  });
});
