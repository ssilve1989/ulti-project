import type { RosterTeam, SlotFill } from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import { formatTeamMessage } from './team-message';

const STARTS_AT = '2026-10-10T00:00:00.000Z';
const progger = (discordId: string): SlotFill => ({
  kind: 'progger',
  participantId: `${discordId}-FRU`,
  discordId,
});
const helper = (discordId: string): SlotFill => ({
  kind: 'helper',
  discordId,
  displayName: 'Helper',
});

describe('the message for a team with gaps', () => {
  it('leaves an empty slot as its bare shortcode, with no trailing newline', () => {
    const team: RosterTeam = {
      id: 'team-1',
      slots: {
        'tank-1': progger('101'),
        'tank-2': progger('102'),
        'regen-healer': progger('103'),
        'dps-flex': progger('105'),
        melee: progger('106'),
        caster: helper('108'),
      },
    };

    expect(formatTeamMessage(STARTS_AT, team)).toBe(`Starts at <t:1791590400:F>
Data Center: Aether
:Tank~1: <@101>
:Tank~1: <@102>
:regenhealers: <@103>
:shieldhealers:
:DPS~1: <@105>
:Melee~1: <@106>
:Ranged:
:Caster~1: <@108>`);
  });
});
