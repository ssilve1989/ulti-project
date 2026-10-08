import type { GuildMember } from 'discord.js';
import type { SettingsDocument } from '../firebase/models/settings.model.js';

/** Whether `member` holds one of the guild's event organizer roles. */
export function isOrganizer(
  member: GuildMember,
  settings: SettingsDocument | undefined,
): boolean {
  const roles = settings?.eventOrganizerRoles ?? [];
  return roles.some((roleId) => member.roles.cache.has(roleId));
}

/** What to tell a member who isn't an organizer. */
export function notOrganizerMessage(
  settings: SettingsDocument | undefined,
): string {
  return settings?.eventOrganizerRoles?.length
    ? 'Only event organizers can do that.'
    : 'No event organizer roles are set. An admin can set them with /settings event-organizers.';
}
