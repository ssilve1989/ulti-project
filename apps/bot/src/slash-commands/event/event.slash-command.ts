import { getEncounterChoicesForMode } from '@ulti-project/shared';
import {
  ChannelType,
  SlashCommandBuilder,
  type SlashCommandChannelOption,
  type SlashCommandIntegerOption,
  type SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { appConfig } from '../../config/app.js';

const encounterOption =
  (
    name: string,
    required: boolean,
    description = required ? 'Encounter' : 'Another encounter (optional)',
  ) =>
  (option: SlashCommandStringOption) =>
    option
      .setName(name)
      .setDescription(description)
      .setRequired(required)
      .addChoices(...getEncounterChoicesForMode(appConfig.APPLICATION_MODE));

/** On edit, any encounter given replaces all of the schedule's encounters. */
const replacementEncounterOption = (name: string, first: boolean) =>
  encounterOption(
    name,
    false,
    first ? 'Replace the encounters (first)' : 'Another replacement encounter',
  );

const titleOption = (required: boolean) => (option: SlashCommandStringOption) =>
  option
    .setName('title')
    .setDescription('Event title')
    .setRequired(required)
    .setMaxLength(100);

// Discord requires the required options before the optional ones
const CreateEventSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Post an event people can sign up to')
  .addStringOption(titleOption(true))
  .addStringOption((option) =>
    option
      .setName('start')
      .setDescription(
        'Start time: a Discord timestamp like <t:1760000000:F>, or unix seconds',
      )
      .setRequired(true),
  )
  .addStringOption(encounterOption('encounter-1', true))
  .addStringOption((option) =>
    option
      .setName('signups-close')
      .setDescription(
        'When sign-ups close (same format). Defaults to the start time',
      ),
  )
  .addStringOption(encounterOption('encounter-2', false))
  .addStringOption(encounterOption('encounter-3', false))
  .addStringOption(encounterOption('encounter-4', false));

const CloseEventSubcommand = new SlashCommandSubcommandBuilder()
  .setName('close')
  .setDescription('Close an event: no more sign-ups or withdrawals')
  .addStringOption((option) =>
    option
      .setName('event')
      .setDescription('The event')
      .setRequired(true)
      .setAutocomplete(true),
  );

const timeOption = (required: boolean) => (option: SlashCommandStringOption) =>
  option
    .setName('time')
    .setDescription('Start time, like 20:00, 8pm or 8:30 pm')
    .setRequired(required);

const postAheadOption = (option: SlashCommandIntegerOption) =>
  option
    .setName('post-ahead')
    .setDescription('Hours before the start to post each event (default 72)')
    .setMinValue(1)
    .setMaxValue(336);

const signupsCloseBeforeOption = (option: SlashCommandIntegerOption) =>
  option
    .setName('signups-close-before')
    .setDescription(
      'Hours before the start that sign-ups close (default 0, at the start)',
    )
    .setMinValue(0)
    .setMaxValue(335);

const channelOption = (option: SlashCommandChannelOption) =>
  option
    .setName('channel')
    .setDescription('Where to post the events (default this channel)')
    .addChannelTypes(ChannelType.GuildText);

// Discord requires the required options before the optional ones
const CreateScheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-create')
  .setDescription('Post an event every week; pick the days in the panel')
  .addStringOption(titleOption(true))
  .addStringOption(encounterOption('encounter-1', true))
  .addStringOption(timeOption(true))
  .addIntegerOption(postAheadOption)
  .addIntegerOption(signupsCloseBeforeOption)
  .addChannelOption(channelOption)
  .addStringOption(encounterOption('encounter-2', false))
  .addStringOption(encounterOption('encounter-3', false))
  .addStringOption(encounterOption('encounter-4', false));

const EditScheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-edit')
  .setDescription('Change a weekly schedule; pick the days in the panel')
  .addStringOption((option) =>
    option
      .setName('schedule')
      .setDescription('The schedule')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption(titleOption(false))
  .addStringOption(replacementEncounterOption('encounter-1', true))
  .addStringOption(timeOption(false))
  .addIntegerOption(postAheadOption)
  .addIntegerOption(signupsCloseBeforeOption)
  .addChannelOption(channelOption)
  .addStringOption(replacementEncounterOption('encounter-2', false))
  .addStringOption(replacementEncounterOption('encounter-3', false))
  .addStringOption(replacementEncounterOption('encounter-4', false));

export const EventSlashCommand = new SlashCommandBuilder()
  .setName('event')
  .setDescription('Create and manage events')
  .addSubcommand(CreateEventSubcommand)
  .addSubcommand(CloseEventSubcommand)
  .addSubcommand(CreateScheduleSubcommand)
  .addSubcommand(EditScheduleSubcommand);
