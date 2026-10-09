import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  TimestampStyles,
  time,
} from 'discord.js';
import type {
  EventScheduleDocument,
  ScheduleSettings,
} from '../../firebase/models/event-schedule.model.js';
import {
  EVENT_ENCOUNTERS_SELECT_ID,
  encounterSelect,
} from '../components/encounter-select.js';
import {
  nextOccurrence,
  type Recurrence,
  SCHEDULE_TIME_ZONES,
  timeZoneLabel,
  type Weekday,
  Weekdays,
  ZONE_NAMES,
} from './next-occurrence.js';

export interface ScheduleDraft extends Omit<ScheduleSettings, 'weekdays'> {
  /** May be empty while the organizer hasn't picked a day yet. */
  weekdays: Weekday[];
}

export const SCHEDULE_DAYS_SELECT_ID = 'scheduleDays';
export const SCHEDULE_ZONE_SELECT_ID = 'scheduleZone';
export const SCHEDULE_SAVE_ID = 'scheduleSave';
export const SCHEDULE_CANCEL_ID = 'scheduleCancel';

const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const MILLISECONDS_PER_HOUR = 3_600_000;

export function renderSchedulePanel(
  draft: ScheduleDraft,
  now: Date,
  mode: 'create' | 'edit',
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const embed = new EmbedBuilder()
    .setTitle(`${mode === 'create' ? 'New' : 'Edit'} schedule: ${draft.title}`)
    .setDescription(preview(draft, now))
    .addFields(
      { name: 'Channel', value: channelMention(draft.channelId) },
      {
        name: 'Post ahead',
        value: hours(draft.postLeadHours),
      },
    );
  return {
    embeds: [embed],
    components: [
      encounterSelect(EVENT_ENCOUNTERS_SELECT_ID, draft.encounters),
      daysRow(draft),
      zoneRow(draft, now),
      buttonRow(draft),
    ],
  };
}

/** `Tue, Thu at 8:00 PM Eastern`, with the days Monday to Sunday. */
export function describeRecurrence({
  weekdays,
  startTime,
  timeZone,
}: Recurrence): string {
  return `${shortDays(weekdays)} at ${twelveHour(startTime)} ${ZONE_NAMES[timeZone]}`;
}

/** `Tue, Thu`, Monday to Sunday. */
export function shortDays(weekdays: readonly Weekday[]): string {
  return Weekdays.filter((day) => weekdays.includes(day))
    .map((day) => DAY_NAMES[day].slice(0, 3))
    .join(', ');
}

/** What the organizer is told once `schedule` is saved. */
export function savedScheduleSummary(schedule: EventScheduleDocument): string {
  const saved = `Saved **${schedule.title}**: ${describeRecurrence(schedule)} in ${channelMention(schedule.channelId)}.`;
  if (!schedule.nextPostAt) {
    return `${saved} It's paused, so nothing is posted until it's resumed.`;
  }
  return `${saved} Next event ${time(schedule.nextStartAt.toDate(), TimestampStyles.FullDateShortTime)}, posted ${time(schedule.nextPostAt.toDate(), TimestampStyles.RelativeTime)}.`;
}

/** `20:05` → `8:05 PM` */
function twelveHour(startTime: string): string {
  const [hour, minute] = startTime.split(':');
  const hours = Number(hour);
  return `${hours % 12 || 12}:${minute} ${hours < 12 ? 'AM' : 'PM'}`;
}

function preview(draft: ScheduleDraft, now: Date): string {
  if (draft.weekdays.length === 0) {
    return 'Pick at least one day.';
  }
  const start = nextOccurrence(draft, now);
  const posted = hoursBefore(start, draft.postLeadHours);
  const signupsClose =
    draft.signupsCloseBeforeHours === 0
      ? 'Sign-ups close when it starts.'
      : `Sign-ups close ${hours(draft.signupsCloseBeforeHours)} before it starts (${time(hoursBefore(start, draft.signupsCloseBeforeHours), TimestampStyles.RelativeTime)}).`;
  return [
    `${describeRecurrence(draft)}.`,
    `The next event starts ${time(start, TimestampStyles.FullDateShortTime)} and is posted ${time(posted, TimestampStyles.RelativeTime)}.`,
    signupsClose,
  ].join('\n');
}

/** `1 hour`, `72 hours` */
function hours(count: number): string {
  return `${count} ${count === 1 ? 'hour' : 'hours'}`;
}

function hoursBefore(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * MILLISECONDS_PER_HOUR);
}

function daysRow(
  draft: ScheduleDraft,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SCHEDULE_DAYS_SELECT_ID)
      .setMinValues(1)
      .setMaxValues(Weekdays.length)
      .addOptions(
        Weekdays.map((day) => ({
          label: DAY_NAMES[day],
          value: day,
          default: draft.weekdays.includes(day),
        })),
      ),
  );
}

function zoneRow(
  draft: ScheduleDraft,
  now: Date,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SCHEDULE_ZONE_SELECT_ID)
      .addOptions(
        SCHEDULE_TIME_ZONES.map((zone) => ({
          label: timeZoneLabel(zone, now),
          value: zone,
          default: zone === draft.timeZone,
        })),
      ),
  );
}

function buttonRow(
  draft: ScheduleDraft,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SCHEDULE_SAVE_ID)
      .setLabel('Save')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(
        draft.weekdays.length === 0 || draft.encounters.length === 0,
      ),
    new ButtonBuilder()
      .setCustomId(SCHEDULE_CANCEL_ID)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}
