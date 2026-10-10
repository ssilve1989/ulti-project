import type {
  BoardParticipant,
  Encounter,
  JobRole,
  SquadView,
} from '@ulti-project/shared';
import { JOB_ROLE_ORDER } from '@ulti-project/shared/jobs';

/** The Show filter: everyone, one squad's claims, or unclaimed players. */
export type SquadFilter =
  | { kind: 'all' }
  | { kind: 'squad'; squadId: string }
  | { kind: 'unclaimed' };

/** One prog point of an encounter, as the rail lists it. */
export interface ProgPointItem {
  /** The prog point's place in the encounter (`phase.order`); the URL's `pp`. */
  readonly order: number;
  readonly label: string;
  readonly rows: BoardParticipant[];
  readonly unclaimed: number;
}

/** The encounter's prog points that have sign-ups, furthest first; each is named by the first of its players seen. */
export function progPointsOf(
  participants: readonly BoardParticipant[],
  encounter: Encounter,
): ProgPointItem[] {
  const points = new Map<number, { label: string; rows: BoardParticipant[] }>();
  for (const participant of participants) {
    if (participant.encounter !== encounter) continue;
    const point = points.get(participant.phase.order);
    if (point) point.rows.push(participant);
    else
      points.set(participant.phase.order, {
        label: participant.phase.label,
        rows: [participant],
      });
  }
  return [...points]
    .sort(([a], [b]) => b - a)
    .map(([order, { label, rows }]) => ({
      order,
      label,
      rows,
      unclaimed: rows.filter((row) => row.claim === null).length,
    }));
}

/** The point a board opens on: the furthest with an unclaimed player, else the furthest. */
export function defaultProgPoint(
  items: readonly ProgPointItem[],
): ProgPointItem | undefined {
  return items.find((item) => item.unclaimed > 0) ?? items[0];
}

/** How many tanks, healers and dps `rows` has. */
export function roleCounts(
  rows: readonly BoardParticipant[],
): Record<JobRole, number> {
  const counts: Record<JobRole, number> = { tank: 0, healer: 0, dps: 0 };
  for (const row of rows) counts[row.jobRole] += 1;
  return counts;
}

/** Board order within a prog point: tank, healer, dps, then character name (locale compare). */
export function compareRows(a: BoardParticipant, b: BoardParticipant): number {
  return (
    JOB_ROLE_ORDER[a.jobRole] - JOB_ROLE_ORDER[b.jobRole] ||
    a.character.localeCompare(b.character)
  );
}

export function matchesFilter(
  participant: BoardParticipant,
  filter: SquadFilter,
): boolean {
  switch (filter.kind) {
    case 'all':
      return true;
    case 'squad':
      return participant.claim?.squadId === filter.squadId;
    case 'unclaimed':
      return participant.claim === null;
  }
}

/** A group-by-squad section: a squad's claimed rows, or (squad undefined) the unclaimed ones. */
export interface SquadSection {
  readonly squad: SquadView | undefined;
  readonly rows: readonly BoardParticipant[];
}

/**
 * Splits rows already in board order (sorted and filtered) into sections: one per squad in
 * `squads` order that has rows, then the unclaimed rows. Rows keep their order; empty sections
 * are left out.
 */
export function groupBySquad(
  rows: readonly BoardParticipant[],
  squads: readonly SquadView[],
): SquadSection[] {
  return [
    ...squads.map((squad) => ({
      squad,
      rows: rows.filter((row) => row.claim?.squadId === squad.id),
    })),
    { squad: undefined, rows: rows.filter((row) => row.claim === null) },
  ].filter((section) => section.rows.length > 0);
}
