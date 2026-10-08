import { getEncounterChoicesForMode } from '@ulti-project/shared';
import {
  SlashCommandBuilder,
  type SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { appConfig } from '../../config/app.js';

const encounterOption =
  (name: string, required: boolean) => (option: SlashCommandStringOption) =>
    option
      .setName(name)
      .setDescription(required ? 'Encounter' : 'Another encounter (optional)')
      .setRequired(required)
      .addChoices(...getEncounterChoicesForMode(appConfig.APPLICATION_MODE));

// Discord requires the required options before the optional ones
const CreateEventSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Post an event people can sign up to')
  .addStringOption((option) =>
    option
      .setName('title')
      .setDescription('Event title')
      .setRequired(true)
      .setMaxLength(100),
  )
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

export const EventSlashCommand = new SlashCommandBuilder()
  .setName('event')
  .setDescription('Create and manage events')
  .addSubcommand(CreateEventSubcommand)
  .addSubcommand(CloseEventSubcommand);
