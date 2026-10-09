import { ButtonStyle, ComponentType } from 'discord.js';
import { onTestFinished } from 'vitest';
import {
  type EventChange,
  EventChangesBus,
} from '../events/event-changes.bus.js';
import type { FlowApp } from './flow-app.js';

/** Which of an event message's buttons are enabled. */
export interface EventButtonsEnabled {
  signup: boolean;
  withdraw: boolean;
}

/** The event message's row of buttons for `eventId`, as Discord receives it. */
export const eventButtonRow = (
  eventId: string,
  { signup, withdraw }: EventButtonsEnabled,
) => ({
  type: ComponentType.ActionRow,
  components: [
    {
      type: ComponentType.Button,
      custom_id: `event:signup:${eventId}`,
      label: 'Sign up',
      style: ButtonStyle.Primary,
      disabled: !signup,
    },
    {
      type: ComponentType.Button,
      custom_id: `event:withdraw:${eventId}`,
      label: 'Withdraw',
      style: ButtonStyle.Secondary,
      disabled: !withdraw,
    },
  ],
});

/** The encounter menu's choices (value and label) in the default, ultimate, mode. */
export const ULTIMATE_CHOICES: readonly (readonly [string, string])[] =
  Object.freeze([['DMU', 'Dancing Mad (Ultimate)']]);

/** The encounter menu offering `choices` (value and label) with `selected` pre-selected, as Discord receives it. */
export const encounterRow = (
  choices: readonly (readonly [value: string, label: string])[],
  selected: readonly string[],
) => ({
  type: ComponentType.ActionRow,
  components: [
    {
      type: ComponentType.StringSelect,
      custom_id: 'eventEncounters',
      placeholder: 'Choose encounters',
      min_values: 1,
      max_values: choices.length,
      options: choices.map(([value, label]) => ({
        label,
        value,
        default: selected.includes(value),
      })),
    },
  ],
});

/**
 * Records the changes the app publishes for `eventId` from now until the test
 * ends, as an open board stream would see them.
 */
export function recordChanges(flow: FlowApp, eventId: string): EventChange[] {
  const seen: EventChange[] = [];
  const subscription = flow
    .get(EventChangesBus)
    .changes(eventId)
    .subscribe((change) => {
      seen.push(change);
    });
  onTestFinished(() => subscription.unsubscribe());
  return seen;
}
