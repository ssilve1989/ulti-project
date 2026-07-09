import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const SyncProgRolesSlashCommand = new SlashCommandBuilder()
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setName('sync-prog-roles')
  .setDescription(
    'Retroactively apply prog point mapped roles for active signups',
  )
  .addBooleanOption((option) =>
    option
      .setName('dry-run')
      .setDescription('Preview changes without applying roles')
      .setRequired(false),
  );
