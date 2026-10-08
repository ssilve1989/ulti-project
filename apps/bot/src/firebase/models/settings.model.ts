import type { Job } from '@ulti-project/shared';
import { Encounter } from '@ulti-project/shared';
import type { DocumentData } from 'firebase-admin/firestore';

export interface SettingsDocument extends DocumentData {
  reviewChannel?: string;
  reviewerRole?: string;
  autoModChannelId?: string;
  blacklistChannelIds?: string[];
  signupChannel?: string;
  spreadsheetId?: string;

  progRoles?: {
    [key in keyof typeof Encounter]?: string;
  };

  clearRoles?: {
    [key in keyof typeof Encounter]?: string;
  };

  progPointRoles?: {
    [key in keyof typeof Encounter]?: Record<string, string>;
  };

  jobEmojis?: Partial<Record<Job, string>>;

  eventOrganizerRoles?: string[];
}

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
