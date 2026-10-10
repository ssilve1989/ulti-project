import type { BoardParticipant } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { FROGE, participant, SPACE } from '../test-utils/fixtures';
import {
  compareRows,
  defaultProgPoint,
  groupBySquad,
  progPointsOf,
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

describe('sorting a prog point into board order', () => {
  it('puts tanks, then healers, then dps, each by name', () => {
    const rows = [
      participant({ discordId: 'p1', character: 'Bricktop', job: 'MNK' }),
      participant({ discordId: 'p2', character: 'Zed', job: 'WAR' }),
      participant({ discordId: 'p3', character: 'aeryn', job: 'NIN' }),
      participant({ discordId: 'p4', character: 'Wren', job: 'WHM' }),
      participant({ discordId: 'p5', character: 'Abe', job: 'GNB' }),
    ];

    expect(rows.sort(compareRows).map((row) => row.character)).toEqual([
      'Abe',
      'Zed',
      'Wren',
      'aeryn',
      'Bricktop',
    ]);
  });
});

describe("an encounter's prog points", () => {
  const CLEARED = Object.freeze({
    label: 'Cleared',
    order: 60,
    bucket: 'clear',
  });
  const yuna = participant({ discordId: 'p1', character: 'Yuna', phase: P3 });
  const zed = participant({
    discordId: 'p2',
    character: 'Zed',
    phase: P4,
    claim: claimBy('frg'),
  });
  const abe = participant({
    discordId: 'p3',
    character: 'Abe',
    phase: CLEARED,
  });
  const wren = participant({
    discordId: 'p4',
    character: 'Wren',
    phase: P3,
    claim: claimBy('spc'),
  });
  const tor = participant({
    discordId: 'p5',
    character: 'Tor',
    encounter: 'TOP',
    phase: P2,
  });

  it('are the points that have sign-ups, furthest first, each with its players and unclaimed count', () => {
    expect(progPointsOf([yuna, zed, abe, wren, tor], 'FRU')).toEqual([
      { order: 60, label: 'Cleared', rows: [abe], unclaimed: 1 },
      { order: 40, label: 'P4: Enrage', rows: [zed], unclaimed: 0 },
      { order: 30, label: 'P3: Apocalypse', rows: [yuna, wren], unclaimed: 1 },
    ]);
  });

  it('open on the furthest point that has an unclaimed player', () => {
    const items = progPointsOf([yuna, zed, wren], 'FRU');

    expect(defaultProgPoint(items)?.order).toBe(30);
  });

  it('open on the furthest point when every player is claimed', () => {
    const items = progPointsOf([zed, wren], 'FRU');

    expect(defaultProgPoint(items)?.order).toBe(40);
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
