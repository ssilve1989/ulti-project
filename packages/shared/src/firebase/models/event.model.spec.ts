import { describe, expect, it } from 'vitest';
import { Encounter } from '../../encounters/encounters.consts.ts';
import { encounterPhases } from './event.model.ts';
import { PartyStatus } from './signup.model.ts';

describe('encounterPhases', () => {
  it('gives each role one phase, at the furthest prog point it maps to', () => {
    const point = (id: string, order: number, clear = false) => ({
      id,
      label: id,
      order,
      active: true,
      partyStatus: clear ? PartyStatus.ClearParty : PartyStatus.ProgParty,
    });

    const phases = encounterPhases(
      Encounter.FRU,
      [point('p1', 0), point('p2', 1), point('p3', 2, true)],
      {
        progPointRoles: { FRU: { p1: 'early', p2: 'late', p3: 'late' } },
        clearRoles: { FRU: 'cleared' },
      },
    );

    expect(phases).toEqual([
      { roleId: 'early', label: 'p1', order: 0, bucket: 'prog' },
      { roleId: 'late', label: 'p3', order: 2, bucket: 'clear' },
      { roleId: 'cleared', label: 'Cleared', order: 3, bucket: 'clear' },
    ]);
  });
});
