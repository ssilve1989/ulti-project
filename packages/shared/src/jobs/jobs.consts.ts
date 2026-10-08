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

export const JOB_ROLE: Readonly<Record<Job, JobRole>> = Object.freeze({
  PLD: 'tank',
  WAR: 'tank',
  DRK: 'tank',
  GNB: 'tank',
  WHM: 'healer',
  SCH: 'healer',
  AST: 'healer',
  SGE: 'healer',
  MNK: 'dps',
  DRG: 'dps',
  NIN: 'dps',
  SAM: 'dps',
  RPR: 'dps',
  VPR: 'dps',
  BRD: 'dps',
  MCH: 'dps',
  DNC: 'dps',
  BLM: 'dps',
  SMN: 'dps',
  RDM: 'dps',
  PCT: 'dps',
});

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
