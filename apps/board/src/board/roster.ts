import type {
  BoardParticipant,
  Encounter,
  JobRole,
  SquadView,
} from '@ulti-project/shared';

export type Bucket = BoardParticipant['phase']['bucket'];

/** The Show filter: everyone, one squad's claims, or unclaimed players. */
export type SquadFilter =
  | { kind: 'all' }
  | { kind: 'squad'; squadId: string }
  | { kind: 'unclaimed' };

// Restated from shared's JOB_ROLE_ORDER: app code imports shared for types only.
const ROLE_ORDER: Readonly<Record<JobRole, number>> = Object.freeze({
  tank: 0,
  healer: 1,
  dps: 2,
});

/** An encounter's players in one party (sub-table), unsorted. */
export function partyOf(
  participants: readonly BoardParticipant[],
  encounter: Encounter,
  bucket: Bucket,
): BoardParticipant[] {
  return participants.filter(
    (p) => p.encounter === encounter && p.phase.bucket === bucket,
  );
}

/** Board order: furthest phase first (`phase.order` descending), then tank, healer, dps, then character name (locale compare). */
export function compareRows(a: BoardParticipant, b: BoardParticipant): number {
  return (
    b.phase.order - a.phase.order ||
    ROLE_ORDER[a.jobRole] - ROLE_ORDER[b.jobRole] ||
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

/** Per displayed row: whether its phase label repeats the row above (dimmed), and whether it starts a new phase (hairline above). */
export interface RowMarks {
  readonly repeat: boolean;
  readonly phaseStart: boolean;
}

export function rowMarks(rows: readonly BoardParticipant[]): RowMarks[] {
  return rows.map((row, index) => {
    const repeat = row.phase.label === rows[index - 1]?.phase.label;
    return { repeat, phaseStart: !repeat };
  });
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
