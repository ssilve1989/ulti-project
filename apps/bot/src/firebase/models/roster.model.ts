import type {
  Encounter,
  RosterSlot,
  RosterTeam,
  SlotFill,
} from '@ulti-project/shared';

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

/** The roster with `discordId` taken out of every slot they fill. */
export function clearFromRoster(
  roster: RosterDocument,
  discordId: string,
): RosterDocument {
  return {
    ...roster,
    teams: roster.teams.map((team) => ({
      ...team,
      slots: Object.fromEntries(
        Object.entries(team.slots).filter(
          ([, fill]) => fill.discordId !== discordId,
        ),
      ),
    })),
  };
}

/**
 * The roster with `fill` in the team's slot, replacing any occupant. Whoever
 * `fill` is leaves any other slot first, so nobody is placed twice.
 */
export function placeInRoster(
  roster: RosterDocument,
  teamId: string,
  slot: RosterSlot,
  fill: SlotFill,
): RosterDocument {
  const moved = clearFromRoster(roster, fill.discordId);
  return {
    ...moved,
    teams: moved.teams.map((team) =>
      team.id === teamId
        ? { ...team, slots: { ...team.slots, [slot]: fill } }
        : team,
    ),
  };
}
