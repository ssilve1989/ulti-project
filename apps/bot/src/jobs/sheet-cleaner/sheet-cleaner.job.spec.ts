import type { Logger, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { CronJob } from 'cron';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { runTick, settledState } from '../../test-utils/cron-tick.js';
import {
  createAutoMock,
  withInternals,
} from '../../test-utils/mock-factory.js';
import { SheetCleanerJob } from './sheet-cleaner.job.js';

type Internals = {
  cleanSheet: () => Promise<void>;
  logger: Logger;
};

describe('SheetCleanerJob', () => {
  let internals: Internals;
  let cronFrom: MockInstance<typeof CronJob.from>;

  beforeEach(async () => {
    // Pass-through spy: captures the (Sentry-wrapped) onTick cron will run.
    cronFrom = vi.spyOn(CronJob, 'from');

    const fixture = await Test.createTestingModule({
      providers: [SheetCleanerJob],
    })
      .useMocker(createAutoMock)
      .setLogger(createAutoMock<LoggerService>())
      .compile();

    internals = withInternals<Internals>(fixture.get(SheetCleanerJob));
  });

  afterEach(() => {
    cronFrom.mockRestore();
  });

  describe('scheduled tick', () => {
    it('keeps the tick pending until the run settles', async () => {
      const run = Promise.withResolvers<void>();
      vi.spyOn(internals, 'cleanSheet').mockReturnValue(run.promise);

      const tick = runTick(cronFrom);

      expect(await settledState(tick)).toBe('pending');
      run.resolve();
      await expect(tick).resolves.toBeUndefined();
    });

    describe('when the run fails', () => {
      let captureException: MockInstance<Sentry.Scope['captureException']>;

      beforeEach(() => {
        captureException = vi.spyOn(Sentry.Scope.prototype, 'captureException');
      });

      afterEach(() => {
        captureException.mockRestore();
      });

      it('rejects the tick so the cron monitor records a failed run, and still reports it', async () => {
        const error = new Error('run failed');
        vi.spyOn(internals, 'cleanSheet').mockRejectedValue(error);
        const logError = vi
          .spyOn(internals.logger, 'error')
          .mockImplementation(() => undefined);

        await expect(runTick(cronFrom)).rejects.toBe(error);
        expect(captureException).toHaveBeenCalledWith(error);
        expect(logError).toHaveBeenCalledWith(
          error,
          'sheet-cleaner job failed',
        );
      });
    });
  });
});
