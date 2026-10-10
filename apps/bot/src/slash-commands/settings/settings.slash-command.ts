import {
  Encounter,
  getEncounterChoicesForMode,
  JOB_NAME,
  JOBS,
} from '@ulti-project/shared';
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { appConfig } from '../../config/app.js';

const EditChannelsSubcommand = new SlashCommandSubcommandBuilder()
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
      .setDescription(
        'The channel for automatic moderation messages. Blacklist alerts use /settings blacklist-channels',
      )
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false),
  );

const EditBlacklistChannelsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('blacklist-channels')
  .setDescription('Choose the channels that receive blacklist notifications');

const EditReviewerRoleSubcommand = new SlashCommandSubcommandBuilder()
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

const EditEncounterRolesSubcommand = new SlashCommandSubcommandBuilder()
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

const EditProgPointRolesSubcommand = new SlashCommandSubcommandBuilder()
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

const EditJobEmojisSubcommand = new SlashCommandSubcommandBuilder()
  .setName('job-emojis')
  .setDescription('Set the emoji shown for a job on event sign-ups')
  .addStringOption((option) =>
    option
      .setName('job')
      .setDescription('The job')
      .setRequired(true)
      .addChoices(
        ...JOBS.map((job) => ({
          name: `${JOB_NAME[job]} (${job})`,
          value: job,
        })),
      ),
  )
  .addStringOption((option) =>
    option
      .setName('emoji')
      .setDescription('A custom emoji (paste it, or its id). Omit to clear')
      .setRequired(false),
  );

const EditBoardAccessSubcommand = new SlashCommandSubcommandBuilder()
  .setName('board-access')
  .setDescription('Choose the roles that can view the coordinator board');

const AddSquadSubcommand = new SlashCommandSubcommandBuilder()
  .setName('squad-add')
  .setDescription('Add a squad to the coordinator board')
  .addStringOption((option) =>
    option
      .setName('name')
      .setDescription('The squad’s name')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(50),
  )
  .addStringOption((option) =>
    option
      .setName('tag')
      .setDescription('2–4 letters or digits, like FRG')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('color')
      .setDescription('A hex colour, like #16a34a')
      .setRequired(true),
  )
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription('The role the squad’s members hold')
      .setRequired(true),
  );

const RemoveSquadSubcommand = new SlashCommandSubcommandBuilder()
  .setName('squad-remove')
  .setDescription('Remove a squad from the coordinator board')
  .addStringOption((option) =>
    option
      .setName('squad')
      .setDescription('The squad to remove')
      .setRequired(true)
      .setAutocomplete(true),
  );

const EditSpreadsheetSubcommand = new SlashCommandSubcommandBuilder()
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

const ViewSettingsSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('view the current bot settings');

export const SettingsSlashCommand = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Configure/Review the bots roles and channel settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(EditBlacklistChannelsSubcommand)
  .addSubcommand(EditChannelsSubcommand)
  .addSubcommand(EditReviewerRoleSubcommand)
  .addSubcommand(EditEncounterRolesSubcommand)
  .addSubcommand(EditProgPointRolesSubcommand)
  .addSubcommand(EditJobEmojisSubcommand)
  .addSubcommand(EditBoardAccessSubcommand)
  .addSubcommand(AddSquadSubcommand)
  .addSubcommand(RemoveSquadSubcommand)
  .addSubcommand(EditSpreadsheetSubcommand)
  .addSubcommand(ViewSettingsSubcommand);
