import { GatewayIntentBits, Partials } from 'discord.js';

export const INTENTS = [
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
];

export const PARTIALS = [Partials.Message, Partials.Channel, Partials.Reaction];
