import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const CleanRolesSlashCommand = new SlashCommandBuilder()
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setName('clean-roles')
  .setDescription('Remove clear/prog roles from members without active signups')
  .addBooleanOption((option) =>
    option
      .setName('dry-run')
      .setDescription('Preview changes without actually removing roles')
      .setRequired(false),
  );
