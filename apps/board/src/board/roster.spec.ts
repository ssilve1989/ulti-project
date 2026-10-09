import type { BoardParticipant } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { FROGE, participant, SPACE } from '../test-utils/fixtures';
import {
  compareRows,
  groupBySquad,
  matchesFilter,
  partyOf,
  rowMarks,
} from './roster';

const P4 = Object.freeze({ label: 'P4: Enrage', order: 40, bucket: 'prog' });
const P3 = Object.freeze({
  label: 'P3: Apocalypse',
  order: 30,
  bucket: 'prog',
});
const P2 = Object.freeze({
  label: 'P2: Light Rampant',
  order: 20,
  bucket: 'prog',
});

function claimBy(squadId: string): BoardParticipant['claim'] {
  return {
    squadId,
    claimedBy: 'lead-1',
    claimedAt: '2026-10-09T18:00:00.000Z',
  };
}

describe('partyOf', () => {
  it('keeps only the players of that encounter and bucket', () => {
    const fruProg = participant({ discordId: 'p1', character: 'Aeryn Vail' });
    const fruClear = participant({
      discordId: 'p2',
      character: 'Bricktop',
      phase: { label: 'Clear', order: 100, bucket: 'clear' },
    });
    const topProg = participant({
      discordId: 'p3',
      character: 'Cid Nan',
      encounter: 'TOP',
    });

    expect(partyOf([fruProg, fruClear, topProg], 'FRU', 'prog')).toEqual([
      fruProg,
    ]);
  });
});

describe('sorting a party into board order', () => {
  it('puts the furthest phase first, then tank, healer, dps, then name', () => {
    const party = [
      participant({
        discordId: 'p1',
        character: 'Bricktop',
        job: 'MNK',
        phase: P3,
      }),
      participant({ discordId: 'p2', character: 'Abe', job: 'WAR', phase: P2 }),
      participant({ discordId: 'p3', character: 'Zed', job: 'DRG', phase: P4 }),
      participant({
        discordId: 'p4',
        character: 'aeryn',
        job: 'NIN',
        phase: P3,
      }),
      participant({
        discordId: 'p5',
        character: 'Yuna',
        job: 'GNB',
        phase: P4,
      }),
      participant({
        discordId: 'p6',
        character: 'Wren',
        job: 'WHM',
        phase: P3,
      }),
    ];

    expect(party.sort(compareRows).map((row) => row.character)).toEqual([
      'Yuna',
      'Zed',
      'Wren',
      'aeryn',
      'Bricktop',
      'Abe',
    ]);
  });
});

describe('matchesFilter', () => {
  const froges = participant({
    discordId: 'p1',
    character: 'Aeryn Vail',
    claim: claimBy(FROGE.id),
  });
  const spaces = participant({
    discordId: 'p2',
    character: 'Bricktop',
    claim: claimBy(SPACE.id),
  });
  const unclaimed = participant({ discordId: 'p3', character: 'Cid Nan' });
  const rows = [froges, spaces, unclaimed];

  it('shows everyone for All', () => {
    expect(rows.filter((row) => matchesFilter(row, { kind: 'all' }))).toEqual(
      rows,
    );
  });

  it("shows only a squad's claims for that squad", () => {
    expect(
      rows.filter((row) =>
        matchesFilter(row, { kind: 'squad', squadId: FROGE.id }),
      ),
    ).toEqual([froges]);
  });

  it('shows only unclaimed players for Unclaimed only', () => {
    expect(
      rows.filter((row) => matchesFilter(row, { kind: 'unclaimed' })),
    ).toEqual([unclaimed]);
  });
});

describe('rowMarks', () => {
  it('dims a repeated phase and marks the start of each new phase', () => {
    const rows = [P4, P4, P3, P3, P3, P2].map((phase, index) =>
      participant({
        discordId: `p${index}`,
        character: `Player ${index}`,
        phase,
      }),
    );

    expect(rowMarks(rows)).toEqual([
      { repeat: false, phaseStart: true },
      { repeat: true, phaseStart: false },
      { repeat: false, phaseStart: true },
      { repeat: true, phaseStart: false },
      { repeat: true, phaseStart: false },
      { repeat: false, phaseStart: true },
    ]);
  });
});

describe('groupBySquad', () => {
  const spaceFirst = participant({
    discordId: 'p1',
    character: 'Aeryn Vail',
    claim: claimBy(SPACE.id),
  });
  const froges = participant({
    discordId: 'p2',
    character: 'Bricktop',
    claim: claimBy(FROGE.id),
  });
  const unclaimed = participant({ discordId: 'p3', character: 'Cid Nan' });
  const spaceLast = participant({
    discordId: 'p4',
    character: 'Dara Moss',
    claim: claimBy(SPACE.id),
  });

  it('gives a section per squad in squad order, then the unclaimed', () => {
    expect(
      groupBySquad([spaceFirst, froges, unclaimed, spaceLast], [FROGE, SPACE]),
    ).toEqual([
      { squad: FROGE, rows: [froges] },
      { squad: SPACE, rows: [spaceFirst, spaceLast] },
      { squad: undefined, rows: [unclaimed] },
    ]);
  });

  it('leaves out the unclaimed section when every row is claimed', () => {
    expect(groupBySquad([spaceFirst, froges], [FROGE, SPACE])).toEqual([
      { squad: FROGE, rows: [froges] },
      { squad: SPACE, rows: [spaceFirst] },
    ]);
  });
});
