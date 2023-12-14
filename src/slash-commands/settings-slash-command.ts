import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const SettingsSlashCommand = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Configure the bots roles and channel settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((option) =>
    option
      .setName('reviewer-role')
      .setDescription('the role that is allowed to review signups'),
  )
  .addChannelOption((option) =>
    option
      .setName('signup-review-channel')
      .setDescription('The channel in which reviews will be posted'),
  );
