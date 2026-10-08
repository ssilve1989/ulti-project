import { type Encounter, isEncounter } from '@ulti-project/shared';
import type {
  ChatInputCommandInteraction,
  CommandInteractionOptionResolver,
} from 'discord.js';
import type { ScheduleSettings } from '../../firebase/models/event-schedule.model.js';
import { parseTimeOfDay } from './time-of-day.js';

/** The schedule settings set by slash options; days and timezone come from the panel. */
type ScheduleOptions = Omit<ScheduleSettings, 'weekdays' | 'timeZone'>;

type OptionsResult<T> =
  | { ok: true; values: T }
  | { ok: false; message: string };

const BAD_TIME = "I couldn't read that time. Try 20:00, 8pm or 8:30 pm.";
const BAD_HOURS =
  'Sign-ups must close less than post-ahead hours before the start.';

const DEFAULT_POST_LEAD_HOURS = 72;

const ENCOUNTER_OPTIONS = [
  'encounter-1',
  'encounter-2',
  'encounter-3',
  'encounter-4',
];

type Options = Pick<
  CommandInteractionOptionResolver<'cached'>,
  'getString' | 'getInteger' | 'getChannel'
>;

/** The encounters picked, each once, in option order. */
function readEncounters(options: Options): Encounter[] {
  const picked = ENCOUNTER_OPTIONS.map((name) => options.getString(name));
  return [
    ...new Set(
      picked.filter(
        (value): value is Encounter => value !== null && isEncounter(value),
      ),
    ),
  ];
}

const closesTooEarly = ({
  postLeadHours,
  signupsCloseBeforeHours,
}: Pick<ScheduleOptions, 'postLeadHours' | 'signupsCloseBeforeHours'>) =>
  signupsCloseBeforeHours >= postLeadHours;

/** `/event schedule-create`'s options, with their defaults. */
export function readScheduleOptions(
  interaction: ChatInputCommandInteraction<'cached'>,
): OptionsResult<ScheduleOptions> {
  const { options } = interaction;
  const startTime = parseTimeOfDay(options.getString('time', true));
  if (startTime === undefined) return { ok: false, message: BAD_TIME };

  const values: ScheduleOptions = {
    title: options.getString('title', true),
    encounters: readEncounters(options),
    startTime,
    postLeadHours: options.getInteger('post-ahead') ?? DEFAULT_POST_LEAD_HOURS,
    signupsCloseBeforeHours: options.getInteger('signups-close-before') ?? 0,
    channelId: options.getChannel('channel')?.id ?? interaction.channelId,
  };
  return closesTooEarly(values)
    ? { ok: false, message: BAD_HOURS }
    : { ok: true, values };
}

/**
 * The options `/event schedule-edit` was given, as changes to `current`.
 * Encounters given replace all of the current ones.
 */
export function readScheduleChanges(
  interaction: ChatInputCommandInteraction<'cached'>,
  current: ScheduleSettings,
): OptionsResult<Partial<ScheduleOptions>> {
  const { options } = interaction;
  // only options that were given, so an absent one never overwrites a stored field
  const changes: Partial<ScheduleOptions> = {};

  const title = options.getString('title');
  if (title !== null) changes.title = title;

  const encounters = readEncounters(options);
  if (encounters.length > 0) changes.encounters = encounters;

  const time = options.getString('time');
  if (time !== null) {
    const startTime = parseTimeOfDay(time);
    if (startTime === undefined) return { ok: false, message: BAD_TIME };
    changes.startTime = startTime;
  }

  const postLeadHours = options.getInteger('post-ahead');
  if (postLeadHours !== null) changes.postLeadHours = postLeadHours;

  const signupsCloseBeforeHours = options.getInteger('signups-close-before');
  if (signupsCloseBeforeHours !== null) {
    changes.signupsCloseBeforeHours = signupsCloseBeforeHours;
  }

  const channel = options.getChannel('channel');
  if (channel !== null) changes.channelId = channel.id;

  return closesTooEarly({ ...current, ...changes })
    ? { ok: false, message: BAD_HOURS }
    : { ok: true, values: changes };
}
