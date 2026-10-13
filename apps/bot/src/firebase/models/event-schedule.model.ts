import type { Encounter } from '@ulti-project/shared';
import type { Timestamp } from 'firebase-admin/firestore';
import type {
  ScheduleTimeZone,
  Weekday,
} from '../../events/schedules/next-occurrence.js';

// No `extends DocumentData`, for the reason EventDocument gives
export interface EventScheduleDocument {
  guildId: string;
  title: string;
  encounters: Encounter[];
  channelId: string;
  weekdays: Weekday[];
  /** `HH:mm`, 24h, in `timeZone` */
  startTime: string;
  timeZone: ScheduleTimeZone;
  postLeadHours: number;
  signupsCloseBeforeHours: number;
  paused: boolean;
  /** The next occurrence not yet posted */
  nextStartAt: Timestamp;
  /** nextStartAt − postLeadHours; absent while paused (single-field due query) */
  nextPostAt?: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export type ScheduleSettings = Pick<
  EventScheduleDocument,
  | 'title'
  | 'encounters'
  | 'channelId'
  | 'weekdays'
  | 'startTime'
  | 'timeZone'
  | 'postLeadHours'
  | 'signupsCloseBeforeHours'
>;

export type StoredSchedule = EventScheduleDocument & { id: string };
