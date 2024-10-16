import { GatewayIntentBits, Message, Partials } from 'discord.js';

export const INTENTS = [
  // GatewayIntentBits.DirectMessages,
  // GatewayIntentBits.GuildMessages,
  // GatewayIntentBits.GuildPresences,
  // GatewayIntentBits.MessageContent,
  /**
   * The Guilds intent populates and maintains the guilds, channels and guild.roles caches, plus thread-related events.
   * If this intent is not enabled, data for interactions and messages
   * will include only the guild and channel id, and will not resolve to the full class.
   */
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessageReactions,
  // This intent is needed to request the entire list of members for a guild
  // which is now needed for the remove-role feature
  GatewayIntentBits.GuildMembers,
];

export const PARTIALS = [Partials.Message, Partials.Channel, Partials.Reaction];

/**
 * creates a URL to a given discord message
 * @param message the message to create a link for
 * @returns
 */
export function getMessageLink({
  guildId,
  channelId,
  id,
}: Pick<Message, 'guildId' | 'channelId' | 'id'>) {
  return `https://discord.com/channels/${guildId}/${channelId}/${id}`;
}

/**
 * the amount of seconds in each unit of time
 */
export const CACHE_TIME_VALUES = {
  SECOND: 1,
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
};
