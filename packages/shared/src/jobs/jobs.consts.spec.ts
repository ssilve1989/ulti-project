import { describe, expect, it } from 'vitest';
import {
  isJob,
  JOB_PARTY_ROLE,
  JOB_ROLE_ORDER,
  JOBS,
  PARTY_ROLE_JOB_ROLE,
} from './jobs.consts.ts';

describe('jobs', () => {
  it('lists the 21 combat jobs in role order', () => {
    expect(JOBS).toEqual([
      'PLD',
      'WAR',
      'DRK',
      'GNB',
      'WHM',
      'SCH',
      'AST',
      'SGE',
      'MNK',
      'DRG',
      'NIN',
      'SAM',
      'RPR',
      'VPR',
      'BRD',
      'MCH',
      'DNC',
      'BLM',
      'SMN',
      'RDM',
      'PCT',
    ]);
  });

  it('gives every job a role', () => {
    expect(
      Object.groupBy(JOBS, (job) => PARTY_ROLE_JOB_ROLE[JOB_PARTY_ROLE[job]]),
    ).toEqual({
      tank: ['PLD', 'WAR', 'DRK', 'GNB'],
      healer: ['WHM', 'SCH', 'AST', 'SGE'],
      dps: [
        'MNK',
        'DRG',
        'NIN',
        'SAM',
        'RPR',
        'VPR',
        'BRD',
        'MCH',
        'DNC',
        'BLM',
        'SMN',
        'RDM',
        'PCT',
      ],
    });
  });

  it('orders tanks, then healers, then dps', () => {
    expect(JOB_ROLE_ORDER).toEqual({ tank: 0, healer: 1, dps: 2 });
  });

  it('recognises job abbreviations only', () => {
    expect(['SGE', 'sge', 'Healer', ''].map(isJob)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});
