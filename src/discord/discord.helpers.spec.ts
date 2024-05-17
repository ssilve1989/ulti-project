import { createMock } from '@golevelup/ts-vitest';
import { PartialMessageReaction, PartialUser } from 'discord.js';
import { CacheTime, hydrateReaction, hydrateUser } from './discord.helpers.js';

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

    expect(hydrateReaction(reaction)).resolves.toBe(reaction);
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

    expect(hydrateUser(user)).resolves.toBe(user);
  });

  it('returns the right value in seconds for a requested cache time unit', () => {
    expect(CacheTime(1, 'seconds')).toBe(1);
    expect(CacheTime(1, 'minutes')).toBe(60);
    expect(CacheTime(1, 'hours')).toBe(3600);
    expect(CacheTime(1, 'days')).toBe(86400);
    expect(CacheTime(2, 'minutes')).toBe(120);
  });
});
