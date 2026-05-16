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

export const TeamsSlashCommand = new SlashCommandBuilder()
  .setName('teams')
  .setDescription('Manage helper teams')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(CreateSubcommand)
  .addSubcommand(EditSubcommand)
  .addSubcommand(ArchiveSubcommand)
  .addSubcommand(MembersSubcommand)
  .addSubcommand(ViewSubcommand);
