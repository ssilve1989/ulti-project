import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} from 'discord.js';

export const BLACKLIST_CHANNELS_SELECT_ID = 'settingsBlacklistChannelsSelect';

export function createBlacklistChannelsSelectRow(currentIds: string[]) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(BLACKLIST_CHANNELS_SELECT_ID)
    .setPlaceholder('Select blacklist notification channels')
    .addChannelTypes(ChannelType.GuildText)
    .setMinValues(0)
    .setMaxValues(25)
    .setDefaultChannels(currentIds);

  return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
}
