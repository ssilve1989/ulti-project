import type { Encounter } from '../encounters/encounters.consts.ts';
import { JOB_ROLE, JOBS, type Job } from '../jobs/jobs.consts.ts';

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

/** A squad's teams for one of an event's encounters. */
export interface BoardRoster {
  encounter: Encounter;
  squadId: string;
  teams: RosterTeam[];
}

const TANKS: readonly Job[] = ['PLD', 'WAR', 'DRK', 'GNB'];

/** Every slot of a team, in the order the copied Discord message lists them. */
export const ROSTER_SLOTS: readonly {
  slot: RosterSlot;
  label: string;
  shortcode: string;
  jobs: readonly Job[];
}[] = Object.freeze([
  { slot: 'tank-1', label: 'Tank', shortcode: ':Tank~1:', jobs: TANKS },
  { slot: 'tank-2', label: 'Tank', shortcode: ':Tank~1:', jobs: TANKS },
  {
    slot: 'regen-healer',
    label: 'Regen healer',
    shortcode: ':regenhealers:',
    jobs: ['WHM', 'AST'],
  },
  {
    slot: 'shield-healer',
    label: 'Shield healer',
    shortcode: ':shieldhealers:',
    jobs: ['SCH', 'SGE'],
  },
  {
    slot: 'dps-flex',
    label: 'DPS',
    shortcode: ':DPS~1:',
    jobs: JOBS.filter((job) => JOB_ROLE[job] === 'dps'),
  },
  {
    slot: 'melee',
    label: 'Melee',
    shortcode: ':Melee~1:',
    jobs: ['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR'],
  },
  {
    slot: 'ranged',
    label: 'Ranged',
    shortcode: ':Ranged:',
    jobs: ['BRD', 'MCH', 'DNC'],
  },
  {
    slot: 'caster',
    label: 'Caster',
    shortcode: ':Caster~1:',
    jobs: ['BLM', 'SMN', 'RDM', 'PCT'],
  },
]);

export function isRosterSlot(value: string): value is RosterSlot {
  return ROSTER_SLOTS.some(({ slot }) => slot === value);
}
