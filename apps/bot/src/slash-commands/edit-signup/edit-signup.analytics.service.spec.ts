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
  let setTag: Mock;
  let captureMessage: Mock;

  // The suite runs with `test.isolate: false` (see error.service.spec.ts), so the
  // module registry is shared: reset it and re-import against a doMock'd Sentry.
  beforeEach(async () => {
    vi.resetModules();

    setTag = vi.fn();
    captureMessage = vi.fn();
    vi.doMock('@sentry/nestjs', () => ({
      withScope: vi.fn(
        (
          fn: (scope: {
            setTag: typeof setTag;
            captureMessage: typeof captureMessage;
          }) => void,
        ) => fn({ setTag, captureMessage }),
      ),
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

    expect(captureMessage).toHaveBeenCalledWith('edit-signup.invoked');
    expect(setTag).toHaveBeenCalledWith('edit_signup_event', 'invoked');
    expect(setTag).toHaveBeenCalledWith('encounter', Encounter.DSR);
  });

  it('reports a guard block with the reason', () => {
    service.guardBlocked(Encounter.DSR, 'reviewPending');

    expect(captureMessage).toHaveBeenCalledWith('edit-signup.guard-blocked');
    expect(setTag).toHaveBeenCalledWith('guard_reason', 'reviewPending');
  });

  it('reports a save with kind and comment flag', () => {
    service.saved('correction', Encounter.DSR, true);

    expect(captureMessage).toHaveBeenCalledWith('edit-signup.saved');
    expect(setTag).toHaveBeenCalledWith('edit_kind', 'correction');
    expect(setTag).toHaveBeenCalledWith('with_comment', 'true');
  });

  it('defaults saved to with_comment false', () => {
    service.saved('reversal');

    expect(setTag).toHaveBeenCalledWith('with_comment', 'false');
  });

  it('reports a sheet error', () => {
    service.savedWithSheetsError('correction', Encounter.DSR);

    expect(captureMessage).toHaveBeenCalledWith(
      'edit-signup.saved-with-sheets-error',
    );
  });

  it('reports a conflict', () => {
    service.conflict('correction', Encounter.DSR);

    expect(captureMessage).toHaveBeenCalledWith('edit-signup.conflict');
    expect(setTag).toHaveBeenCalledWith('edit_kind', 'correction');
  });

  it('reports a cancellation', () => {
    service.cancelled(Encounter.DSR);

    expect(captureMessage).toHaveBeenCalledWith('edit-signup.cancelled');
  });

  it('reports a timeout', () => {
    service.timedOut(Encounter.DSR);

    expect(captureMessage).toHaveBeenCalledWith('edit-signup.timed-out');
  });
});
