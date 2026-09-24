import { Logger } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { createFlowApp } from './flow-app.js';

describe('createFlowApp', () => {
  it('fails close() when the app logged an error the test did not expect', async () => {
    const flow = await createFlowApp();

    new Logger('SomeHandler').error('swallowed in the background');

    await expect(flow.close()).rejects.toThrow('swallowed in the background');
  });

  it('closes cleanly once the test expects the logged error', async () => {
    const flow = await createFlowApp();
    new Logger('SomeHandler').error('DMs closed');

    flow.expectLoggedError(/DMs closed/);

    await expect(flow.close()).resolves.toBeUndefined();
  });

  it('refuses to expect an error that was never logged', async () => {
    const flow = await createFlowApp();

    expect(() => flow.expectLoggedError(/DMs closed/)).toThrow(
      'No logged error matches',
    );
    await flow.close();
  });
});
