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
