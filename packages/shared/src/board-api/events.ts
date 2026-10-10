import type { Encounter } from '../encounters/encounters.consts.ts';
import type { EventStatus } from '../firebase/models/event.model.ts';
import type { Job, JobRole, PartyRole } from '../jobs/jobs.consts.ts';
import type { SquadView } from './access.ts';
import type { BoardRoster } from './rosters.ts';

/** An event in `GET /api/events`. */
export interface BoardEventSummary {
  id: string;
  title: string;
  startsAt: string;
  encounters: Encounter[];
  participantCount: number;
}

/** A player signed up for one of an event's encounters. */
export interface BoardParticipant {
  /** `${discordId}-${encounter}` */
  id: string;
  encounter: Encounter;
  discordId: string;
  displayName: string;
  character: string;
  world: string;
  job: Job | null;
  role: PartyRole;
  jobRole: JobRole;
  phase: { label: string; order: number; bucket: 'prog' | 'clear' };
  claim: { squadId: string; claimedBy: string; claimedAt: string } | null;
}

/** `GET /api/events/:id`. */
export interface BoardEvent {
  id: string;
  title: string;
  startsAt: string;
  signupsCloseAt: string;
  status: EventStatus;
  encounters: {
    id: Encounter;
    name: string;
    progPartyThreshold?: string;
    clearPartyThreshold?: string;
  }[];
  participants: BoardParticipant[];
  squads: SquadView[];
  /** Rosters of the squads still in settings. */
  rosters: BoardRoster[];
}
