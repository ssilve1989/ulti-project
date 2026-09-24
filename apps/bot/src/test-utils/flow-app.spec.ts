import { hasSubscribers } from 'node:diagnostics_channel';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import nock from 'nock';
import { describe, expect, it, vi } from 'vitest';
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

  it('fails close() when a pressed component was never acknowledged, which Discord shows as a failed interaction', async () => {
    const flow = await createFlowApp();
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

  it('cleans up after itself when the app fails to start', async () => {
    vi.spyOn(Test, 'createTestingModule').mockImplementationOnce(() => {
      throw new Error('a provider could not be resolved');
    });

    await expect(createFlowApp()).rejects.toThrow(
      'a provider could not be resolved',
    );

    expect(nock.isActive()).toBe(false);
    expect(hasSubscribers('http.client.request.created')).toBe(false);
  });
});
