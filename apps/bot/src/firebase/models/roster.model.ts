import {
  type Encounter,
  type RosterDocument,
  type RosterSlot,
  rosterWithout,
  type SlotFill,
} from '@ulti-project/shared';

export type { RosterDocument } from '@ulti-project/shared';

export function rosterDocId(encounter: Encounter, squadId: string): string {
  return `${encounter}-${squadId}`;
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
  return placed ? rosterWithout(roster, isThem) : undefined;
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
  const moved = rosterWithout(
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
