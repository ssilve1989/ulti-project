import type { DocumentData, Timestamp } from 'firebase-admin/firestore';

export interface HelperTeamDocument extends DocumentData {
  guildId: string;
  teamId: string;
  name: string;
  description?: string;
  active: boolean;
  memberRoleId: string;
  leaderUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp;
  deleteAt?: Timestamp;
}

export interface HelperTeamSessionDocument extends DocumentData {
  guildId: string;
  sessionId: string;
  teamId: string;
  active: boolean;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type HelperAbsenceDocument =
  | HelperSessionAbsenceDocument
  | HelperRangeAbsenceDocument;

export interface BaseHelperAbsenceDocument extends DocumentData {
  guildId: string;
  absenceId: string;
  discordId: string;
  reason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface HelperSessionAbsenceDocument
  extends BaseHelperAbsenceDocument {
  type: 'session';
  teamId: string;
  sessionId: string;
  occurrenceStart: Timestamp;
  occurrenceEnd: Timestamp;
}

export interface HelperRangeAbsenceDocument extends BaseHelperAbsenceDocument {
  type: 'range';
  startDate: string;
  endDate: string;
  timezone: string;
}

export interface HelperReminderDeliveryDocument extends DocumentData {
  guildId: string;
  teamId: string;
  sessionId: string;
  occurrenceStart: Timestamp;
  offsetMinutes: 60 | 1440;
  channelId: string;
  messageId?: string;
  sentAt: Timestamp;
}
