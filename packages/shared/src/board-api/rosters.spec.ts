import { describe, expect, it } from 'vitest';
import { Job } from '../jobs/jobs.consts.ts';
import { ROSTER_SLOTS } from './rosters.ts';

describe('ROSTER_SLOTS', () => {
  it('lists the slots in message order, with their labels, shortcodes and suggested jobs', () => {
    expect(ROSTER_SLOTS).toEqual([
      {
        slot: 'tank-1',
        label: 'Tank',
        shortcode: ':Tank~1:',
        jobs: [Job.PLD, Job.WAR, Job.DRK, Job.GNB],
      },
      {
        slot: 'tank-2',
        label: 'Tank',
        shortcode: ':Tank~1:',
        jobs: [Job.PLD, Job.WAR, Job.DRK, Job.GNB],
      },
      {
        slot: 'regen-healer',
        label: 'Regen healer',
        shortcode: ':regenhealers:',
        jobs: [Job.WHM, Job.AST],
      },
      {
        slot: 'shield-healer',
        label: 'Shield healer',
        shortcode: ':shieldhealers:',
        jobs: [Job.SCH, Job.SGE],
      },
      {
        slot: 'dps-flex',
        label: 'DPS',
        shortcode: ':DPS~1:',
        jobs: [
          Job.MNK,
          Job.DRG,
          Job.NIN,
          Job.SAM,
          Job.RPR,
          Job.VPR,
          Job.BRD,
          Job.MCH,
          Job.DNC,
          Job.BLM,
          Job.SMN,
          Job.RDM,
          Job.PCT,
        ],
      },
      {
        slot: 'melee',
        label: 'Melee',
        shortcode: ':Melee~1:',
        jobs: [Job.MNK, Job.DRG, Job.NIN, Job.SAM, Job.RPR, Job.VPR],
      },
      {
        slot: 'ranged',
        label: 'Ranged',
        shortcode: ':Ranged:',
        jobs: [Job.BRD, Job.MCH, Job.DNC],
      },
      {
        slot: 'caster',
        label: 'Caster',
        shortcode: ':Caster~1:',
        jobs: [Job.BLM, Job.SMN, Job.RDM, Job.PCT],
      },
    ]);
  });
});
