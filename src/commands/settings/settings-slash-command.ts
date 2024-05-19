import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { Encounter } from '../../encounters/encounters.consts.js';

const EditSettingsSubcommand = new SlashCommandSubcommandBuilder()
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
  .addChannelOption((option) =>
    option
      .setName('signup-public-channel')
      .setDescription(
        'The channel in which signup approvals will be posted. This must be set to a text channel',
      )
      .addChannelTypes(ChannelType.GuildText),
  )
  .addRoleOption((option) =>
    option
      .setName('reviewer-role')
      .setDescription(
        'an optional role that is allowed to review signups. If not set, anyone can review signups',
      ),
  )
  .addStringOption((option) =>
    option
      .setName('spreadsheet-id')
      .setDescription(
        'The id of the spreadsheet to use for persistence modifications',
      ),
  )
  .addBooleanOption((option) =>
    option
      .setName('turbo-prog-active')
      .setDescription('Whether or not turbo prog is currently active')
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('turbo-prog-spreadsheet-id')
      .setDescription('The id of the spreadsheet to use for turbo prog')
      .setRequired(false),
  );

// add all encounters to have a role option
for (const encounter in Encounter) {
  EditSettingsSubcommand.addRoleOption((option) =>
    option
      .setName(`${encounter.toLowerCase()}-prog-role`)
      .setDescription(
        `The role to be assigned to users who have signed up for this encounter ${encounter}`,
      ),
  );
}

const ViewSettingsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('view the current bot settings');

export const SettingsSlashCommand = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Configure/Review the bots roles and channel settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(EditSettingsSubcommand)
  .addSubcommand(ViewSettingsSubcommand);
