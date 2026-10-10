/** What a button on an event message does. */
export type EventComponentAction = 'signup' | 'withdraw';

/** The `customId` of event `eventId`'s `action` button. */
export const eventComponentId = (
  action: EventComponentAction,
  eventId: string,
): string => `event:${action}:${eventId}`;

/** The action and event an event button's `customId` names, or `undefined` for any other id. */
export function parseEventComponentId(
  customId: string,
): { action: EventComponentAction; eventId: string } | undefined {
  const [prefix, action, ...rest] = customId.split(':');
  const eventId = rest.join(':');
  if (prefix !== 'event' || !eventId) return undefined;
  if (action === 'signup' || action === 'withdraw') {
    return { action, eventId };
  }
  return undefined;
}
