import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';

const AbsentSessionSubcommand = new SlashCommandSubcommandBuilder()
  .setName('absent-session')
  .setDescription('Report an absence for a specific upcoming session')
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason for absence').setRequired(false),
  );

const AbsentRangeSubcommand = new SlashCommandSubcommandBuilder()
  .setName('absent-range')
  .setDescription('Report an absence for a date range')
  .addStringOption((o) =>
    o
      .setName('start-date')
      .setDescription('Start date (YYYY-MM-DD)')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('end-date')
      .setDescription('End date (YYYY-MM-DD)')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName('timezone')
      .setDescription('IANA timezone (e.g. America/Denver)')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason for absence').setRequired(false),
  );

const AbsentRemoveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('absent-remove')
  .setDescription('Remove a previously reported absence');

const StatusSubcommand = new SlashCommandSubcommandBuilder()
  .setName('status')
  .setDescription(
    'View current helper team absence status (coordinators only)',
  );

export const HelpersSlashCommand = new SlashCommandBuilder()
  .setName('helpers')
  .setDescription('Manage helper team absences')
  .addSubcommand(AbsentSessionSubcommand)
  .addSubcommand(AbsentRangeSubcommand)
  .addSubcommand(AbsentRemoveSubcommand)
  .addSubcommand(StatusSubcommand);
