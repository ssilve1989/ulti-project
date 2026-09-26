import { hasSubscribers } from 'node:diagnostics_channel';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import nock from 'nock';
import { test as base, describe, expect, vi } from 'vitest';
import { fresh } from './fixtures.js';
import { createFlowApp, type FlowApp } from './flow-app.js';
import { HTTP_REQUEST_CREATED } from './idle.js';

const it = base.extend<{ flow: FlowApp }>({
  // closed after every test, even one that fails before closing it itself
  flow: fresh(createFlowApp, (flow) => flow.close()),
});

describe('createFlowApp', () => {
  it('fails close() when the app logged an error the test did not expect', async ({
    flow,
  }) => {
    new Logger('SomeHandler').error('swallowed in the background');

    await expect(flow.close()).rejects.toThrow('swallowed in the background');
  });

  it('stops routing Nest logs to its logger once closed', async ({ flow }) => {
    await flow.close();

    new Logger('SomeHandler').error('logged after the app closed');

    expect(() => flow.expectReported(/logged after/)).toThrow(
      'No reported problem matches',
    );
  });

  it('fails close() when the app warned or reported to Sentry without the test expecting it', async ({
    flow,
  }) => {
    new Logger('SomeHandler').warn('something looked odd');
    Sentry.getCurrentScope().captureException(new Error('handled quietly'));

    await expect(flow.close()).rejects.toThrow(
      /warning: something looked odd SomeHandler\n---\nSentry exception: Error: handled quietly/,
    );
  });

  it('closes cleanly once the test expects the logged error', async ({
    flow,
  }) => {
    new Logger('SomeHandler').error('DMs closed');

    flow.expectReported(/DMs closed/);

    await expect(flow.close()).resolves.toBeUndefined();
  });

  it('refuses to expect an error that was never logged', ({ flow }) => {
    expect(() => flow.expectReported(/DMs closed/)).toThrow(
      'No reported problem matches',
    );
  });

  it('fails close() when a pressed component was never acknowledged, which Discord shows as a failed interaction', async ({
    flow,
  }) => {
    flow.discord.addMember({ id: 'u1', username: 'one' });
    const message = await flow.discord.sendDirectMessage('u1', {
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('go')
            .setLabel('Go')
            .setStyle(ButtonStyle.Primary),
        ),
      ],
    });
    const pending = message.awaitMessageComponent();
    flow.discord.click(flow.discord.latestDmTo('u1'), 'go', 'u1');
    await pending;

    await expect(flow.close()).rejects.toThrow('never acknowledged');
  });

  // not the fixture: this test creates an app that fails to start
  base('cleans up after itself when the app fails to start', async () => {
    const createTestingModule = vi
      .spyOn(Test, 'createTestingModule')
      .mockImplementationOnce(() => {
        throw new Error('a provider could not be resolved');
      });

    try {
      await expect(createFlowApp()).rejects.toThrow(
        'a provider could not be resolved',
      );
    } finally {
      // isolate: false shares Test with every later spec in this worker
      createTestingModule.mockRestore();
    }

    expect(nock.isActive()).toBe(false);
    expect(hasSubscribers(HTTP_REQUEST_CREATED)).toBe(false);
    expect(vi.isMockFunction(Sentry.Scope.prototype.captureException)).toBe(
      false,
    );
    expect(vi.isMockFunction(Sentry.Scope.prototype.captureMessage)).toBe(
      false,
    );
  });

  // not the fixture: this test creates an app that fails to start
  base(
    "gives Nest's logging back when the app fails after taking it over",
    async () => {
      // compile() has already routed Nest's logging to the app when init() fails
      const init = vi
        .spyOn(TestingModule.prototype, 'init')
        .mockRejectedValueOnce(new Error('a module failed to initialise'));
      try {
        await expect(createFlowApp()).rejects.toThrow(
          'a module failed to initialise',
        );
      } finally {
        init.mockRestore();
      }

      const written: string[] = [];
      const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk) => {
          written.push(String(chunk));
          return true;
        });
      try {
        new Logger('SomeHandler').error('logged after a failed start');
      } finally {
        stderr.mockRestore();
      }

      expect(written.join('')).toContain('logged after a failed start');
    },
  );
});
