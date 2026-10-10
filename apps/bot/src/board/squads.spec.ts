import { describe, expect, it } from 'vitest';
import { type SquadConfig, squadsOf, validateSquad } from './squads.js';

const FROGS: SquadConfig = Object.freeze({
  name: 'Frogs',
  tag: 'FRG',
  color: '#16a34a',
  roleId: 'frog-role',
});

const INPUT = Object.freeze({
  name: 'Toads',
  tag: 'TOD',
  color: '#a16207',
  roleId: 'toad-role',
});

describe('validateSquad', () => {
  it('accepts a squad with a free tag and role', () => {
    expect(validateSquad(INPUT, { frg: FROGS })).toEqual({
      ok: true,
      squad: INPUT,
    });
  });

  it('trims and upper-cases the tag', () => {
    expect(validateSquad({ ...INPUT, tag: ' tod ' }, {})).toEqual({
      ok: true,
      squad: INPUT,
    });
  });

  it('lower-cases the colour', () => {
    expect(validateSquad({ ...INPUT, color: '#A16207' }, {})).toEqual({
      ok: true,
      squad: INPUT,
    });
  });

  it.each(['F', 'FROGS', 'F-G', 'FR G', ''])('refuses the tag %j', (tag) => {
    expect(validateSquad({ ...INPUT, tag }, {})).toEqual({
      ok: false,
      message: 'Squad tags are 2–4 letters or digits, like FRG.',
    });
  });

  it.each(['16a34a', '#16a34', '#16a34a0', '#16g34a', 'green'])(
    'refuses the colour %j',
    (color) => {
      expect(validateSquad({ ...INPUT, color }, {})).toEqual({
        ok: false,
        message: 'Colours look like #16a34a.',
      });
    },
  );

  it('refuses a tag another squad has, whatever its case', () => {
    expect(validateSquad({ ...INPUT, tag: 'frg' }, { frg: FROGS })).toEqual({
      ok: false,
      message: 'FRG is already a squad.',
    });
  });

  it('refuses a role another squad has', () => {
    expect(
      validateSquad({ ...INPUT, roleId: FROGS.roleId }, { frg: FROGS }),
    ).toEqual({
      ok: false,
      message: '<@&frog-role> already belongs to Frogs.',
    });
  });
});

describe('squadsOf', () => {
  it('lists the squads by tag, with their ids', () => {
    expect(squadsOf({ squads: { tod: { ...INPUT }, frg: FROGS } })).toEqual([
      { id: 'frg', ...FROGS },
      { id: 'tod', ...INPUT },
    ]);
  });

  it('lists none for a guild without squads or settings', () => {
    expect({
      withoutSquads: squadsOf({}),
      withoutSettings: squadsOf(undefined),
    }).toEqual({ withoutSquads: [], withoutSettings: [] });
  });
});
