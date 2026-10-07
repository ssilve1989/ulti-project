/** The roster column a raid-helper class goes in */
export type Role = 'tank' | 'healer' | 'dps' | 'other';

/**
 * FFXIV job abbreviations by raid-helper spec name, lowercased and without
 * the FF suffix raid-helper adds to names other games share (PaladinFF, MonkFF)
 */
const JOB_BADGES: ReadonlyMap<string, string> = new Map([
  ['paladin', 'PLD'],
  ['warrior', 'WAR'],
  ['darkknight', 'DRK'],
  ['gunbreaker', 'GNB'],
  ['whitemage', 'WHM'],
  ['scholar', 'SCH'],
  ['astrologian', 'AST'],
  ['sage', 'SGE'],
  ['monk', 'MNK'],
  ['dragoon', 'DRG'],
  ['ninja', 'NIN'],
  ['samurai', 'SAM'],
  ['reaper', 'RPR'],
  ['viper', 'VPR'],
  ['bard', 'BRD'],
  ['machinist', 'MCH'],
  ['dancer', 'DNC'],
  ['blackmage', 'BLM'],
  ['summoner', 'SMN'],
  ['redmage', 'RDM'],
  ['pictomancer', 'PCT'],
]);

const ROLES: ReadonlyMap<string, Role> = new Map([
  ['Tank', 'tank'],
  ['Healer', 'healer'],
  ['Melee', 'dps'],
  ['Ranged', 'dps'],
  ['Magical', 'dps'],
  ['Dps', 'dps'],
]);

/** How a sign-up's job shows: its FFXIV abbreviation, FLEX for an Allrounder, or what raid-helper calls it */
export function jobBadge({
  specName,
  className,
}: {
  specName?: string | null;
  className: string;
}): string {
  if (!specName) {
    return className === 'Allrounder' ? 'FLEX' : className.toUpperCase();
  }
  const key = specName.toLowerCase().replace(/ff$/, '');
  return JOB_BADGES.get(key) ?? specName;
}

export function roleOf(className: string): Role {
  return ROLES.get(className) ?? 'other';
}
