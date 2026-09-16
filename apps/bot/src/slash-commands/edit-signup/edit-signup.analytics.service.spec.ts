import { Encounter } from '@ulti-project/shared';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

type AnalyticsModule = typeof import('./edit-signup.analytics.service.js');

describe('EditSignupAnalyticsService', () => {
  let service: InstanceType<AnalyticsModule['EditSignupAnalyticsService']>;
  let count: Mock;

  // The suite runs with `test.isolate: false` (see error.service.spec.ts), so the
  // module registry is shared: reset it and re-import against a doMock'd Sentry.
  beforeEach(async () => {
    vi.resetModules();

    count = vi.fn();
    vi.doMock('@sentry/nestjs', () => ({
      metrics: { count },
    }));

    const { EditSignupAnalyticsService } = await import(
      './edit-signup.analytics.service.js'
    );
    service = new EditSignupAnalyticsService();
  });

  afterEach(() => {
    vi.doUnmock('@sentry/nestjs');
    vi.resetModules();
  });

  it('reports invoked', () => {
    service.invoked(Encounter.DSR);

    expect(count).toHaveBeenCalledWith('edit-signup.invoked', 1, {
      attributes: { encounter: Encounter.DSR },
    });
  });

  it('reports a guard block with the reason', () => {
    service.guardBlocked(Encounter.DSR, 'reviewPending');

    expect(count).toHaveBeenCalledWith('edit-signup.guard-blocked', 1, {
      attributes: { encounter: Encounter.DSR, guard_reason: 'reviewPending' },
    });
  });

  it('reports a save with kind and comment flag', () => {
    service.saved('correction', Encounter.DSR, true);

    expect(count).toHaveBeenCalledWith('edit-signup.saved', 1, {
      attributes: {
        encounter: Encounter.DSR,
        edit_kind: 'correction',
        with_comment: true,
      },
    });
  });

  it('defaults saved to with_comment false', () => {
    service.saved('reversal');

    expect(count).toHaveBeenCalledWith('edit-signup.saved', 1, {
      attributes: {
        edit_kind: 'reversal',
        with_comment: false,
      },
    });
  });

  it('reports a sheet error', () => {
    service.savedWithSheetsError('correction', Encounter.DSR);

    expect(count).toHaveBeenCalledWith(
      'edit-signup.saved-with-sheets-error',
      1,
      {
        attributes: { encounter: Encounter.DSR, edit_kind: 'correction' },
      },
    );
  });

  it('reports a conflict', () => {
    service.conflict('correction', Encounter.DSR);

    expect(count).toHaveBeenCalledWith('edit-signup.conflict', 1, {
      attributes: { encounter: Encounter.DSR, edit_kind: 'correction' },
    });
  });

  it('reports a cancellation', () => {
    service.cancelled(Encounter.DSR);

    expect(count).toHaveBeenCalledWith('edit-signup.cancelled', 1, {
      attributes: { encounter: Encounter.DSR },
    });
  });

  it('reports a timeout', () => {
    service.timedOut(Encounter.DSR);

    expect(count).toHaveBeenCalledWith('edit-signup.timed-out', 1, {
      attributes: { encounter: Encounter.DSR },
    });
  });
});
