import { describe, expect, it } from 'vitest';
import { jobBadge, roleOf } from './event-roster.jobs.js';

describe('jobBadge', () => {
  it.each([
    ['PaladinFF', 'Tank', 'PLD'],
    ['Darkknight', 'Tank', 'DRK'],
    ['MonkFF', 'Melee', 'MNK'],
    ['Blackmage', 'Magical', 'BLM'],
    ['Whitemage', 'Healer', 'WHM'],
    ['Bard', 'Ranged', 'BRD'],
    ['Dragoon', 'Melee', 'DRG'],
  ])('abbreviates raid-helper spec %s as %s', (specName, className, badge) => {
    expect(jobBadge({ specName, className })).toBe(badge);
  });

  it('matches specs whatever their case and FF suffix', () => {
    expect(jobBadge({ specName: 'warriorff', className: 'Tank' })).toBe('WAR');
  });

  it('shows an Allrounder without a spec as FLEX', () => {
    expect(jobBadge({ className: 'Allrounder' })).toBe('FLEX');
  });

  it('shows a status-only sign-up by its status', () => {
    expect(jobBadge({ className: 'Bench' })).toBe('BENCH');
  });

  it('shows a spec it does not know as raid-helper names it', () => {
    expect(jobBadge({ specName: 'Beastmaster', className: 'Melee' })).toBe(
      'Beastmaster',
    );
  });
});

describe('roleOf', () => {
  it.each([
    ['Tank', 'tank'],
    ['Healer', 'healer'],
    ['Melee', 'dps'],
    ['Ranged', 'dps'],
    ['Magical', 'dps'],
    ['Dps', 'dps'],
    ['Allrounder', 'other'],
    ['Bench', 'other'],
  ])('puts raid-helper class %s in %s', (className, role) => {
    expect(roleOf(className)).toBe(role);
  });
});
