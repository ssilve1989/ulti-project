import {
  GatewayIntentBits,
  Message,
  PartialMessage,
  Partials,
} from 'discord.js';

export const INTENTS = [
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildPresences,
  /**
   * The Guilds intent populates and maintains the guilds, channels and guild.roles caches, plus thread-related events.
   * If this intent is not enabled, data for interactions and messages
   *  will include only the guild and channel id, and will not resolve to the full class.
   */
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
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
}: Message | PartialMessage) {
  return `https://discord.com/channels/${guildId}/${channelId}/${id}`;
}
