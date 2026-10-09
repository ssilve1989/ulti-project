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

/** The roster without the fills `leaves` picks out. */
function without(
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

/**
 * The roster with the progger `participantId` out of their slot, or undefined
 * if they have none. The same person placed as a helper keeps that slot.
 */
export function clearProgger(
  roster: RosterDocument,
  participantId: string,
): RosterDocument | undefined {
  const isThem = (fill: SlotFill) =>
    fill.kind === 'progger' && fill.participantId === participantId;
  const placed = roster.teams.some((team) =>
    Object.values(team.slots).some(isThem),
  );
  return placed ? without(roster, isThem) : undefined;
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
  const moved = without(
    roster,
    ({ discordId }) => discordId === fill.discordId,
  );
  return {
    ...moved,
    teams: moved.teams.map((team) =>
      team.id === teamId
        ? { ...team, slots: { ...team.slots, [slot]: fill } }
        : team,
    ),
  };
}
