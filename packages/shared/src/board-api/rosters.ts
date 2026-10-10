import type { Encounter } from '../encounters/encounters.consts.ts';
import type { PartyRole } from '../jobs/jobs.consts.ts';

export type RosterSlot =
  | 'tank-1'
  | 'tank-2'
  | 'regen-healer'
  | 'shield-healer'
  | 'dps-flex'
  | 'melee'
  | 'ranged'
  | 'caster';

/** Who fills a slot: a claimed progger, or a helper from the squad's role. */
export type SlotFill =
  | { kind: 'progger'; participantId: string; discordId: string }
  | { kind: 'helper'; discordId: string; displayName: string };

export interface RosterTeam {
  id: string;
  slots: Partial<Record<RosterSlot, SlotFill>>;
}

/** A member of the caller's squad role, whom their leads can place in a team. */
export interface SquadHelper {
  discordId: string;
  displayName: string;
}

/** A squad's teams for one of an event's encounters. */
export interface BoardRoster {
  encounter: Encounter;
  squadId: string;
  teams: RosterTeam[];
}

/** Every slot of a team, in the order the copied Discord message lists them. */
export const ROSTER_SLOTS: readonly {
  slot: RosterSlot;
  label: string;
  shortcode: string;
  roles: readonly PartyRole[];
}[] = Object.freeze([
  { slot: 'tank-1', label: 'Tank', shortcode: ':Tank~1:', roles: ['tank'] },
  { slot: 'tank-2', label: 'Tank', shortcode: ':Tank~1:', roles: ['tank'] },
  {
    slot: 'regen-healer',
    label: 'Regen healer',
    shortcode: ':regenhealers:',
    roles: ['regen'],
  },
  {
    slot: 'shield-healer',
    label: 'Shield healer',
    shortcode: ':shieldhealers:',
    roles: ['shield'],
  },
  {
    slot: 'dps-flex',
    label: 'DPS',
    shortcode: ':DPS~1:',
    roles: ['melee', 'ranged', 'caster'],
  },
  {
    slot: 'melee',
    label: 'Melee',
    shortcode: ':Melee~1:',
    roles: ['melee'],
  },
  {
    slot: 'ranged',
    label: 'Ranged',
    shortcode: ':Ranged:',
    roles: ['ranged'],
  },
  {
    slot: 'caster',
    label: 'Caster',
    shortcode: ':Caster~1:',
    roles: ['caster'],
  },
]);

export function isRosterSlot(value: string): value is RosterSlot {
  return ROSTER_SLOTS.some(({ slot }) => slot === value);
}
