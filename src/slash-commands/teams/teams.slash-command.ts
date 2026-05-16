import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';

const CreateSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Create a new helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for team members')
      .setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('leader').setDescription('Team leader').setRequired(true),
  );

const EditSubcommand = new SlashCommandSubcommandBuilder()
  .setName('edit')
  .setDescription('Edit an existing helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team to edit')
      .setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('leader').setDescription('New team leader').setRequired(false),
  );

const ArchiveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('archive')
  .setDescription('Archive a helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team to archive')
      .setRequired(true),
  );

const MembersSubcommand = new SlashCommandSubcommandBuilder()
  .setName('members')
  .setDescription('View members of a helper team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  );

const ViewSubcommand = new SlashCommandSubcommandBuilder()
  .setName('view')
  .setDescription('View all active helper teams');

const ScheduleAddSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-add')
  .setDescription('Add a recurring weekly session to a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('day-of-week')
      .setDescription('Day of the week')
      .setRequired(true)
      .addChoices(
        { name: 'Monday', value: 1 },
        { name: 'Tuesday', value: 2 },
        { name: 'Wednesday', value: 3 },
        { name: 'Thursday', value: 4 },
        { name: 'Friday', value: 5 },
        { name: 'Saturday', value: 6 },
        { name: 'Sunday', value: 7 },
      ),
  )
  .addStringOption((o) =>
    o
      .setName('start-time')
      .setDescription('Session start time in HH:mm format (e.g. 20:00)')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('duration-minutes')
      .setDescription('Session duration in minutes')
      .setRequired(true)
      .setMinValue(15)
      .setMaxValue(480),
  )
  .addStringOption((o) =>
    o
      .setName('timezone')
      .setDescription('Timezone (e.g. America/Denver, UTC)')
      .setRequired(true),
  );

const ScheduleListSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-list')
  .setDescription('List all active sessions for a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  );

const ScheduleEditSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-edit')
  .setDescription('Edit a recurring session for a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('day-of-week')
      .setDescription('New day of the week')
      .setRequired(false)
      .addChoices(
        { name: 'Monday', value: 1 },
        { name: 'Tuesday', value: 2 },
        { name: 'Wednesday', value: 3 },
        { name: 'Thursday', value: 4 },
        { name: 'Friday', value: 5 },
        { name: 'Saturday', value: 6 },
        { name: 'Sunday', value: 7 },
      ),
  )
  .addStringOption((o) =>
    o
      .setName('start-time')
      .setDescription('New start time in HH:mm format')
      .setRequired(false),
  )
  .addIntegerOption((o) =>
    o
      .setName('duration-minutes')
      .setDescription('New duration in minutes')
      .setRequired(false)
      .setMinValue(15)
      .setMaxValue(480),
  )
  .addStringOption((o) =>
    o
      .setName('timezone')
      .setDescription('New timezone (e.g. America/Denver, UTC)')
      .setRequired(false),
  );

const ScheduleRemoveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-remove')
  .setDescription('Remove a recurring session from a team')
  .addRoleOption((o) =>
    o
      .setName('member-role')
      .setDescription('Role for the team')
      .setRequired(true),
  );

export const TeamsSlashCommand = new SlashCommandBuilder()
  .setName('teams')
  .setDescription('Manage helper teams')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(CreateSubcommand)
  .addSubcommand(EditSubcommand)
  .addSubcommand(ArchiveSubcommand)
  .addSubcommand(MembersSubcommand)
  .addSubcommand(ViewSubcommand)
  .addSubcommand(ScheduleAddSubcommand)
  .addSubcommand(ScheduleListSubcommand)
  .addSubcommand(ScheduleEditSubcommand)
  .addSubcommand(ScheduleRemoveSubcommand);
