import type { DocumentData } from 'firebase-admin/firestore';
import type { Encounter } from '../../encounters/encounters.consts.ts';
import type { Job } from '../../jobs/jobs.consts.ts';

export interface SquadConfig {
  name: string;
  tag: string;
  color: string;
  roleId: string;
}

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

  boardViewerRoles?: string[];

  /** keyed by squad id, the lower-cased tag */
  squads?: Record<string, SquadConfig>;
}
