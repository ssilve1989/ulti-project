export const Job = {
  PLD: 'PLD',
  WAR: 'WAR',
  DRK: 'DRK',
  GNB: 'GNB',
  WHM: 'WHM',
  SCH: 'SCH',
  AST: 'AST',
  SGE: 'SGE',
  MNK: 'MNK',
  DRG: 'DRG',
  NIN: 'NIN',
  SAM: 'SAM',
  RPR: 'RPR',
  VPR: 'VPR',
  BRD: 'BRD',
  MCH: 'MCH',
  DNC: 'DNC',
  BLM: 'BLM',
  SMN: 'SMN',
  RDM: 'RDM',
  PCT: 'PCT',
} as const;

export type Job = (typeof Job)[keyof typeof Job];
export type JobRole = 'tank' | 'healer' | 'dps';

export const JOBS: readonly Job[] = Object.freeze(Object.values(Job));

export const JOB_NAME: Readonly<Record<Job, string>> = Object.freeze({
  PLD: 'Paladin',
  WAR: 'Warrior',
  DRK: 'Dark Knight',
  GNB: 'Gunbreaker',
  WHM: 'White Mage',
  SCH: 'Scholar',
  AST: 'Astrologian',
  SGE: 'Sage',
  MNK: 'Monk',
  DRG: 'Dragoon',
  NIN: 'Ninja',
  SAM: 'Samurai',
  RPR: 'Reaper',
  VPR: 'Viper',
  BRD: 'Bard',
  MCH: 'Machinist',
  DNC: 'Dancer',
  BLM: 'Black Mage',
  SMN: 'Summoner',
  RDM: 'Red Mage',
  PCT: 'Pictomancer',
});

export const JOB_ROLE_ORDER: Readonly<Record<JobRole, number>> = Object.freeze({
  tank: 0,
  healer: 1,
  dps: 2,
});

export function isJob(value: string): value is Job {
  return JOBS.some((job) => job === value);
}

/** What kind of player fills a party slot: Raid-Helper's role categories, and the roster's slots. */
export type PartyRole =
  | 'tank'
  | 'regen'
  | 'shield'
  | 'melee'
  | 'caster'
  | 'ranged';

export const JOB_PARTY_ROLE: Readonly<Record<Job, PartyRole>> = Object.freeze({
  PLD: 'tank',
  WAR: 'tank',
  DRK: 'tank',
  GNB: 'tank',
  WHM: 'regen',
  AST: 'regen',
  SCH: 'shield',
  SGE: 'shield',
  MNK: 'melee',
  DRG: 'melee',
  NIN: 'melee',
  SAM: 'melee',
  RPR: 'melee',
  VPR: 'melee',
  BRD: 'ranged',
  MCH: 'ranged',
  DNC: 'ranged',
  BLM: 'caster',
  SMN: 'caster',
  RDM: 'caster',
  PCT: 'caster',
});

export const PARTY_ROLE_JOB_ROLE: Readonly<Record<PartyRole, JobRole>> =
  Object.freeze({
    tank: 'tank',
    regen: 'healer',
    shield: 'healer',
    melee: 'dps',
    caster: 'dps',
    ranged: 'dps',
  });

export const PARTY_ROLE_NAME: Readonly<Record<PartyRole, string>> =
  Object.freeze({
    tank: 'Tank',
    regen: 'Regen',
    shield: 'Shield',
    melee: 'Melee',
    caster: 'Caster',
    ranged: 'Ranged',
  });
