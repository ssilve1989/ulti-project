import { ChannelType, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  BLACKLIST_CHANNELS_SELECT_ID,
  createBlacklistChannelsSelectRow,
} from './blacklist-channels.components.js';

describe('createBlacklistChannelsSelectRow', () => {
  it('builds a multi-select channel menu restricted to text channels', () => {
    const row = createBlacklistChannelsSelectRow([]).toJSON();

    const [menu] = row.components as {
      type: ComponentType;
      custom_id: string;
      channel_types?: ChannelType[];
      min_values?: number;
      max_values?: number;
    }[];

    expect(menu.type).toBe(ComponentType.ChannelSelect);
    expect(menu.custom_id).toBe(BLACKLIST_CHANNELS_SELECT_ID);
    expect(menu.channel_types).toEqual([ChannelType.GuildText]);
    expect(menu.min_values).toBe(0);
    expect(menu.max_values).toBe(25);
  });

  it('pre-selects the current channels as default values', () => {
    const row = createBlacklistChannelsSelectRow(['chan-1', 'chan-2']).toJSON();

    const [menu] = row.components as {
      default_values?: { id: string; type: string }[];
    }[];

    expect(menu.default_values).toEqual([
      { id: 'chan-1', type: 'channel' },
      { id: 'chan-2', type: 'channel' },
    ]);
  });
});
