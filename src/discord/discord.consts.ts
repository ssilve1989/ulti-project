import { GatewayIntentBits } from 'discord.js';

export const INTENTS =
  GatewayIntentBits.DirectMessages |
  GatewayIntentBits.GuildMembers |
  GatewayIntentBits.GuildMessages |
  GatewayIntentBits.GuildPresences |
  GatewayIntentBits.Guilds |
  GatewayIntentBits.MessageContent;
