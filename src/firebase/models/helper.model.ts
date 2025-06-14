import type { Job } from '@ulti-project/shared';
import type { DocumentData } from 'firebase-admin/firestore';

export interface HelperDocument extends DocumentData {
  id: string;
  discordId: string;
  name: string;
  availableJobs: HelperJob[];
  weeklyAvailability?: HelperWeeklyAvailability[];
  createdAt: Date;
  updatedAt: Date;
}

export interface HelperJob {
  job: Job;
  isPreferred: boolean;
}

export interface HelperWeeklyAvailability {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  timeRanges: HelperTimeRange[];
}

export interface HelperTimeRange {
  start: string; // 24-hour format: "14:00"
  end: string; // 24-hour format: "18:00"
  timezone?: string; // e.g., "America/New_York"
}

export interface HelperAbsenceDocument extends DocumentData {
  id: string;
  helperId: string;
  startDate: Date;
  endDate: Date;
  reason?: string;
  createdAt: Date;
}
