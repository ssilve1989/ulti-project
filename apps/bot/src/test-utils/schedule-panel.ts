import { ButtonStyle, ComponentType } from 'discord.js';
import { USTimeZones } from '../common/time-zones.js';
import type { Weekday } from '../events/schedules/next-occurrence.js';

const DAY_LABELS = Object.freeze([
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
] as const);

/** The schedule panel's days menu with `selected` pre-selected, as Discord receives it. */
export function daysRow(selected: readonly Weekday[]) {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: 'scheduleDays',
        min_values: 1,
        max_values: 7,
        options: DAY_LABELS.map(([value, label]) => ({
          label,
          value,
          default: selected.includes(value),
        })),
      },
    ],
  };
}

/** The four zones' labels while daylight saving time is in effect. */
export const SUMMER_LABELS = Object.freeze([
  'Eastern (UTC−4)',
  'Central (UTC−5)',
  'Mountain (UTC−6)',
  'Pacific (UTC−7)',
] as const);

/** The schedule panel's timezone menu with `labels` and `selected` pre-selected. */
export function zoneRow(
  labels: readonly [string, string, string, string],
  selected: string,
) {
  const zones = [
    USTimeZones.EASTERN,
    USTimeZones.CENTRAL,
    USTimeZones.MOUNTAIN,
    USTimeZones.PACIFIC,
  ];
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: 'scheduleZone',
        options: zones.map((value, index) => ({
          label: labels[index],
          value,
          default: value === selected,
        })),
      },
    ],
  };
}

/** The schedule panel's Save and Cancel buttons. */
export function buttonRow(saveDisabled: boolean) {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        custom_id: 'scheduleSave',
        label: 'Save',
        style: ButtonStyle.Primary,
        disabled: saveDisabled,
      },
      {
        type: ComponentType.Button,
        custom_id: 'scheduleCancel',
        label: 'Cancel',
        style: ButtonStyle.Secondary,
      },
    ],
  };
}
