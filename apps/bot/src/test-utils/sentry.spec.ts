import * as Sentry from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';

describe('when a test puts a user and tags on Sentry scope', {
  shuffle: false,
}, () => {
  it('sets them', () => {
    Sentry.setUser({ id: 'user-1' });
    Sentry.getCurrentScope().setTag('command', 'signup');

    expect(Sentry.getIsolationScope().getUser()).toEqual({ id: 'user-1' });
  });

  it('they are gone in the next test', () => {
    expect({
      user: Sentry.getIsolationScope().getUser(),
      tags: Sentry.getCurrentScope().getScopeData().tags,
    }).toEqual({ user: {}, tags: {} });
  });
});
