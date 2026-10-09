import type { BoardParticipant } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { FROGE, participant, SPACE } from '../test-utils/fixtures';
import { compareRows, groupBySquad } from './roster';

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
});
