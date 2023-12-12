import { SlashCommandBuilder } from 'discord.js';

export const StatusSlashCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Retrieve the status of your current signups');
