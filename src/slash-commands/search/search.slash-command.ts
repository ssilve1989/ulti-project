import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const SearchSlashCommand = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for users by encounter and prog point')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
