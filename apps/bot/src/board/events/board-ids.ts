import { isEncounter } from '@ulti-project/shared';

/**
 * Firestore's auto-ids, and the scheduler's `${scheduleId}-${seconds}`. Only
 * letters, digits and hyphens, so no id from a URL can name another path
 * (`/`, `..`) or a reserved id (`__…__`).
 */
const EVENT_ID = /^[A-Za-z0-9-]{1,128}$/;

/** `${discordId}-${encounter}`: a snowflake, a hyphen, an encounter. */
const PARTICIPANT_ID = /^\d{17,20}-([A-Z]+)$/;

/** Whether `id` can be an event's document id. */
export function isEventId(id: string): boolean {
  return EVENT_ID.test(id);
}

/** Whether `id` can be a participant's document id. */
export function isParticipantId(id: string): boolean {
  const encounter = PARTICIPANT_ID.exec(id)?.[1];
  return encounter !== undefined && isEncounter(encounter);
}
