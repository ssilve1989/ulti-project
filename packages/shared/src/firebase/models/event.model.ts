import type { Timestamp } from 'firebase-admin/firestore';
import type { RosterTeam } from '../../board-api/rosters.ts';
import type { Encounter } from '../../encounters/encounters.consts.ts';
import type { Job } from '../../jobs/jobs.consts.ts';

export const EventStatus = {
  Open: 'open',
  SignupsClosed: 'signups-closed',
  Closed: 'closed',
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export interface EventPhase {
  roleId: string;
  label: string;
  order: number;
  bucket: 'prog' | 'clear';
}

// No `extends DocumentData`: its index signature would make `Omit` (NewEvent,
// upsertParticipant's argument) drop every named field
export interface EventDocument {
  guildId: string;
  title: string;
  startsAt: Timestamp;
  signupsCloseAt: Timestamp;
  /** = signupsCloseAt while `open`, absent otherwise: the scheduler's due query (no composite index) */
  signupsCloseDueAt?: Timestamp;
  encounters: Encounter[];
  channelId: string;
  messageId?: string;
  createdBy: string;
  scheduleId?: string;
  status: EventStatus;
}

export interface ParticipantDocument {
  discordId: string;
  encounter: Encounter;
  job: Job;
  character: string;
  world: string;
  phase: EventPhase;
  signedUpAt: Timestamp;
  claim?: { squadId: string; claimedBy: string; claimedAt: Timestamp };
}

/** `events/{eventId}/rosters/{rosterDocId}`: one squad's teams for one encounter. */
export interface RosterDocument {
  guildId: string;
  encounter: Encounter;
  squadId: string;
  teams: RosterTeam[];
}

/** A participant's id in `events/{eventId}/participants`: one per member per encounter. */
export function participantDocId(discordId: string, encounter: Encounter) {
  return `${discordId}-${encounter}`;
}
