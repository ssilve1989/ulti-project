import { SlashCommandBuilder } from 'discord.js';

export const LookupSlashCommand = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription(
    'lookup a players signup information, including availability, encounters, etc.',
  )
  .addStringOption((option) =>
    option
      .setName('character')
      .setDescription('Character Name')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('world').setDescription('Home World').setRequired(false),
  );
