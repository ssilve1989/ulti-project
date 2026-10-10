import type { Timestamp } from 'firebase-admin/firestore';
import type { RosterTeam, SlotFill } from '../../board-api/rosters.ts';
import type { Encounter } from '../../encounters/encounters.consts.ts';
import {
  JOB_PARTY_ROLE,
  type Job,
  type PartyRole,
} from '../../jobs/jobs.consts.ts';
import type { ProgPointDocument } from './encounter.model.ts';
import type { SettingsDocument } from './settings.model.ts';
import { PartyStatus } from './signup.model.ts';

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

/**
 * Every phase a role gives for `encounter`: one per mapped role, at the
 * furthest prog point it maps to (a tie keeps the first), plus the clear
 * role, one past the last prog point so it ranks furthest. Labelled by the
 * prog point, or `Cleared`; the bot relabels them with the Discord role's name.
 */
export function encounterPhases(
  encounter: Encounter,
  progPoints: readonly ProgPointDocument[],
  settings: SettingsDocument | undefined,
): EventPhase[] {
  const mapping = settings?.progPointRoles?.[encounter] ?? {};
  const byRole = new Map<string, EventPhase>();
  for (const point of progPoints) {
    const roleId = mapping[point.id];
    if (roleId === undefined) continue;
    const furthest = byRole.get(roleId);
    if (furthest && point.order <= furthest.order) continue;
    byRole.set(roleId, {
      roleId,
      label: point.label,
      order: point.order,
      bucket: point.partyStatus === PartyStatus.ClearParty ? 'clear' : 'prog',
    });
  }
  const phases = [...byRole.values()];
  const clearRole = settings?.clearRoles?.[encounter];
  if (clearRole) {
    phases.push({
      roleId: clearRole,
      label: 'Cleared',
      order: progPoints.length,
      bucket: 'clear',
    });
  }
  return phases;
}

// No `extends DocumentData`: its index signature would make `Omit` (NewEvent)
// drop every named field
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

interface ParticipantBase {
  discordId: string;
  encounter: Encounter;
  character: string;
  world: string;
  phase: EventPhase;
  signedUpAt: Timestamp;
}

/** How a participant's job is known: picked with the Sign up button, or only its role, synced from Raid-Helper. */
type ParticipantPlay =
  | { job: Job; role?: never; source?: never }
  | { job?: never; role: PartyRole; source: 'raid-helper' };

/** A participant as a sign-up or a sync writes it; a claim comes later. */
export type NewParticipant = ParticipantBase & ParticipantPlay;

export type ParticipantDocument = NewParticipant & {
  claim?: { squadId: string; claimedBy: string; claimedAt: Timestamp };
};

/** The participant's party role: their job's, or the one Raid-Helper gave. */
export function partyRoleOf(participant: ParticipantPlay): PartyRole {
  return participant.job === undefined
    ? participant.role
    : JOB_PARTY_ROLE[participant.job];
}

/** `events/{eventId}/rosters/{rosterDocId}`: one squad's teams for one encounter. */
export interface RosterDocument {
  guildId: string;
  encounter: Encounter;
  squadId: string;
  teams: RosterTeam[];
}

/** The roster without the fills `leaves` picks out. */
export function rosterWithout(
  roster: RosterDocument,
  leaves: (fill: SlotFill) => boolean,
): RosterDocument {
  return {
    ...roster,
    teams: roster.teams.map((team) => ({
      ...team,
      slots: Object.fromEntries(
        Object.entries(team.slots).filter(([, fill]) => !leaves(fill)),
      ),
    })),
  };
}

/** A participant's id in `events/{eventId}/participants`: one per member per encounter. */
export function participantDocId(discordId: string, encounter: Encounter) {
  return `${discordId}-${encounter}`;
}
