import { getBlacklistChannelIds } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';

describe('getBlacklistChannelIds', () => {
  it('returns the configured channel list when set', () => {
    expect(
      getBlacklistChannelIds({
        blacklistChannelIds: ['chan-1', 'chan-2'],
        autoModChannelId: 'automod-chan',
      }),
    ).toEqual(['chan-1', 'chan-2']);
  });

  it('respects an explicitly saved empty list without falling back', () => {
    expect(
      getBlacklistChannelIds({
        blacklistChannelIds: [],
        autoModChannelId: 'automod-chan',
      }),
    ).toEqual([]);
  });

  it('falls back to the auto-mod channel when the list is unset', () => {
    expect(
      getBlacklistChannelIds({ autoModChannelId: 'automod-chan' }),
    ).toEqual(['automod-chan']);
  });

  it('returns an empty list when neither setting exists', () => {
    expect(getBlacklistChannelIds({})).toEqual([]);
    expect(getBlacklistChannelIds(undefined)).toEqual([]);
  });
});
