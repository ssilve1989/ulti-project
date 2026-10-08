import { ButtonStyle, ComponentType } from 'discord.js';

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
