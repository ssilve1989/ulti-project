import type { SettingsDocument } from '@ulti-project/shared';

export type { SettingsDocument } from '@ulti-project/shared';

/**
 * Resolves the channels that should receive blacklist notifications.
 * Guilds that predate `blacklistChannelIds` fall back to `autoModChannelId`;
 * an explicitly saved empty list means notifications are intentionally off.
 */
export function getBlacklistChannelIds(
  settings: SettingsDocument | undefined,
): string[] {
  if (settings?.blacklistChannelIds) {
    return settings.blacklistChannelIds;
  }

  return settings?.autoModChannelId ? [settings.autoModChannelId] : [];
}
