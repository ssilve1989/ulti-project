import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const RetireSlashCommand = new SlashCommandBuilder()
  .setName('retire')
  .setDescription('Retire all members of the current helper role')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((option) =>
    option
      .setName('current-helper-role')
      .setDescription('The role to be replaced')
      .setRequired(true),
  )
  .addRoleOption((option) =>
    option
      .setName('retired-helper-role')
      .setDescription('The role to replace with')
      .setRequired(true),
  );
