import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const RemoveRoleSlashCommand = new SlashCommandBuilder()
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setName('remove-role')
  .setDescription(
    'Warning! This command will remove the selected role from all guild members',
  )
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription('the role to remove')
      .setRequired(true),
  );
