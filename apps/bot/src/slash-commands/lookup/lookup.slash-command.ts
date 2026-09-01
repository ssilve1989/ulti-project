import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const LookupSlashCommand = new SlashCommandBuilder()
  .setName('lookup')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDescription(
    'lookup a players signup information, including encounters, prog points, etc.',
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
