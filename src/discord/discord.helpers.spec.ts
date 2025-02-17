import { createMock } from '@golevelup/ts-vitest';
import type {
  ChatInputCommandInteraction,
  PartialMessageReaction,
  PartialUser,
} from 'discord.js';
import {
  CacheTime,
  hydrateReaction,
  hydrateUser,
  safeReply,
} from './discord.helpers.js';

describe('Discord Helper Methods', () => {
  it('hydrates a partial reaction', async () => {
    const fetch = vi.fn().mockResolvedValue({});
    const reaction = createMock<PartialMessageReaction>({
      partial: true,
      valueOf: () => '',
      fetch,
    });

    await hydrateReaction(reaction);
    expect(fetch).toHaveBeenCalled();
  });

  it('returns the given reaction if not partial', () => {
    const reaction = createMock<PartialMessageReaction>({
      partial: undefined,
      valueOf: () => '',
    });

    return expect(hydrateReaction(reaction)).resolves.toBe(reaction);
  });

  it('hydrates a partial user', async () => {
    const fetch = vi.fn().mockResolvedValue({});
    const user = createMock<PartialUser>({
      partial: true,
      valueOf: () => '',
      fetch,
      toString: () => '<@foo>',
    });

    await hydrateUser(user);
    expect(fetch).toHaveBeenCalled();
  });

  it('returns the given user if not partial', () => {
    const user = createMock<PartialUser>({
      partial: undefined,
      valueOf: () => '',
      toString: () => '<@foo>',
    });

    return expect(hydrateUser(user)).resolves.toBe(user);
  });

  it('returns the right value in seconds for a requested cache time unit', () => {
    expect(CacheTime(1, 'seconds')).toBe(1);
    expect(CacheTime(1, 'minutes')).toBe(60);
    expect(CacheTime(1, 'hours')).toBe(3600);
    expect(CacheTime(1, 'days')).toBe(86400);
    expect(CacheTime(2, 'minutes')).toBe(120);
  });
});

describe('safeReply', () => {
  const payload = 'test payload';
  const testCases = [
    {
      scenario: 'deferred',
      interactionProps: { deferred: true, replied: false },
      expectedMethod: 'editReply',
      resolvedValue: 'edited',
    },
    {
      scenario: 'replied',
      interactionProps: { deferred: false, replied: true },
      expectedMethod: 'followUp',
      resolvedValue: 'followed up',
    },
    {
      scenario: 'default',
      interactionProps: { deferred: false, replied: false },
      expectedMethod: 'reply',
      resolvedValue: 'replied',
    },
  ];

  it.each(testCases)(
    'calls $expectedMethod when interaction is $scenario',
    async ({ interactionProps, expectedMethod, resolvedValue }) => {
      const methodFn = vi.fn().mockResolvedValue(resolvedValue);
      const interaction = createMock<ChatInputCommandInteraction>({
        deferred: interactionProps.deferred,
        replied: interactionProps.replied,
        editReply: expectedMethod === 'editReply' ? methodFn : vi.fn(),
        followUp: expectedMethod === 'followUp' ? methodFn : vi.fn(),
        reply: expectedMethod === 'reply' ? methodFn : vi.fn(),
        valueOf: () => '',
      });

      const result = await safeReply(interaction, payload);
      expect(methodFn).toHaveBeenCalledWith(payload);
      expect(result).toBe(resolvedValue);
    },
  );
});
