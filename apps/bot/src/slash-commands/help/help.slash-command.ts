import { SlashCommandBuilder } from 'discord.js';

export const HelpSlashCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Display a list of all available bot commands');
