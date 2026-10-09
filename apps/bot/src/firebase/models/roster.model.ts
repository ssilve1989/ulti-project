import type { Encounter, RosterTeam } from '@ulti-project/shared';

/** `events/{eventId}/rosters/{rosterDocId}`: one squad's teams for one encounter. */
export interface RosterDocument {
  guildId: string;
  encounter: Encounter;
  squadId: string;
  teams: RosterTeam[];
}

export function rosterDocId(encounter: Encounter, squadId: string): string {
  return `${encounter}-${squadId}`;
}
