import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { appConfig } from '../../config/app.js';
import {
  Encounter,
  getEncounterChoicesForMode,
} from '../../encounters/encounters.consts.js';

export const EditChannelsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('channels')
  .setDescription('Edit channel settings')
  .addChannelOption((option) =>
    option
      .setName('signup-review-channel')
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
  .addChannelOption((option) =>
    option
      .setName('moderation-channel')
      .setDescription('The channel to send automatic moderation messages to')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  );

export const EditReviewerRoleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('reviewer')
  .setDescription('Edit reviewer role settings')
  .addRoleOption((option) =>
    option
      .setName('reviewer-role')
      .setDescription(
        'an optional role that is allowed to review signups. If not set, anyone can review signups',
      )
      .setRequired(true),
  );

export const EditEncounterRolesSubcommand = new SlashCommandSubcommandBuilder()
  .setName('encounter-roles')
  .setDescription('Edit encounter roles')
  .addStringOption((option) =>
    option
      .setName('encounter')
      .setDescription('The encounter to set roles for')
      .setRequired(true)
      .addChoices(
        ...Object.entries(Encounter).map(([name, value]) => ({
          name,
          value,
        })),
      ),
  )
  .addRoleOption((option) =>
    option
      .setName('prog-role')
      .setDescription('The role for prog parties')
      .setRequired(true),
  )
  .addRoleOption((option) =>
    option
      .setName('clear-role')
      .setDescription('The role for clear parties')
      .setRequired(true),
  );

export const EditProgPointRolesSubcommand = new SlashCommandSubcommandBuilder()
  .setName('prog-point-roles')
  .setDescription(
    'Map an encounter’s prog points to a role assigned on approval',
  )
  .addStringOption((option) =>
    option
      .setName('encounter')
      .setDescription('The encounter to configure prog point roles for')
      .setRequired(true)
      .addChoices(...getEncounterChoicesForMode(appConfig.APPLICATION_MODE)),
  )
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription(
        'Role to assign for the selected prog points. Omit to remove their mappings',
      )
      .setRequired(false),
  );

export const EditSpreadsheetSubcommand = new SlashCommandSubcommandBuilder()
  .setName('spreadsheet')
  .setDescription('Edit spreadsheet settings')
  .addStringOption((option) =>
    option
      .setName('spreadsheet-id')
      .setDescription(
        'The id of the spreadsheet to use for persistence modifications',
      )
      .setRequired(true),
  );

export const EditTurboProgSubcommand = new SlashCommandSubcommandBuilder()
  .setName('turbo-prog')
  .setDescription('Edit turbo prog settings')
  .addBooleanOption((option) =>
    option
      .setName('active')
      .setDescription('Whether or not turbo prog is currently active')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('spreadsheet-id')
      .setDescription('The id of the spreadsheet to use for turbo prog')
      .setRequired(false),
  );

export const ViewSettingsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('view the current bot settings');

export const SettingsSlashCommand = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Configure/Review the bots roles and channel settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(EditChannelsSubcommand)
  .addSubcommand(EditReviewerRoleSubcommand)
  .addSubcommand(EditEncounterRolesSubcommand)
  .addSubcommand(EditProgPointRolesSubcommand)
  .addSubcommand(EditSpreadsheetSubcommand)
  .addSubcommand(EditTurboProgSubcommand)
  .addSubcommand(ViewSettingsSubcommand);
