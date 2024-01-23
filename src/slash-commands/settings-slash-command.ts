import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const SettingsSlashCommand = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Configure/Review the bots roles and channel settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('edit')
      .setDescription('Edit the bot settings')
      .addChannelOption((option) =>
        option
          .setName('signup-review-channel')
          .setRequired(true)
          .setDescription(
            'The channel in which reviews will be posted. This must be set to a text channel',
          )
          .addChannelTypes(ChannelType.GuildText),
      )
      .addRoleOption((option) =>
        option
          .setName('reviewer-role')
          .setDescription(
            'an optional role that is allowed to review signups. If not set, anyone can review signups',
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('view').setDescription('view the current bot settings'),
  );
