import { ENCOUNTER_INFO, type SignupDisplayData } from '@ulti-project/shared';

export const mockEncounters = Object.values(ENCOUNTER_INFO);

// Data pools for generating realistic signups
const characterNames = [
  'Warrior Light',
  'Astral Healer',
  'Aether Striker',
  'Crystal Guardian',
  'Void Caster',
  'Divine Scholar',
  'Storm Breaker',
  'Lunar Sage',
  'Iron Defender',
  'Phoenix Rising',
  'Mystic Dancer',
  'Radiant Priest',
  'Shadow Walker',
  'Flame Keeper',
  'Ice Shard',
  'Thunder Strike',
  'Earth Shaker',
  'Wind Caller',
  'Light Bearer',
  'Dark Seeker',
  'Star Gazer',
  'Moon Walker',
  'Sun Dancer',
  'Cloud Rider',
  'Wave Crasher',
  'Fire Heart',
  'Frost Bite',
  'Lightning Rod',
  'Stone Wall',
  'Gale Force',
  'Crimson Blade',
  'Azure Shield',
  'Golden Arrow',
  'Silver Spear',
  'Platinum Edge',
  'Diamond Fist',
  'Ruby Eye',
  'Emerald Wing',
  'Sapphire Soul',
  'Onyx Claw',
  'Mystic Rose',
  'Sacred Flame',
  'Ancient Wisdom',
  'Eternal Hope',
  'Infinite Dream',
  'Brave Heart',
  'Noble Spirit',
  'Pure Light',
  'True Faith',
  'Wild Storm',
  'Gentle Rain',
  'Fierce Wind',
  'Calm Sea',
  'Burning Sun',
  'Shining Moon',
  'Bright Star',
  'Deep Ocean',
  'High Mountain',
  'Wide Sky',
  'Strong Earth',
  'Swift Arrow',
  'Sharp Blade',
  'Heavy Hammer',
  'Light Feather',
  'Dark Shadow',
  'Red Dragon',
  'Blue Phoenix',
  'Green Tiger',
  'White Wolf',
  'Black Panther',
  'Golden Eagle',
  'Silver Hawk',
  'Bronze Lion',
  'Iron Bear',
  'Steel Shark',
  'Crystal Cat',
  'Diamond Dog',
  'Ruby Rabbit',
  'Emerald Fox',
  'Sapphire Owl',
  'Mystic Mage',
  'Holy Priest',
  'Dark Knight',
  'Bright Paladin',
  'Swift Ninja',
  'Strong Warrior',
  'Wise Scholar',
  'Brave Fighter',
  'Noble Guardian',
  'Pure Healer',
  'Wild Hunter',
  'Gentle Bard',
  'Fierce Berserker',
  'Calm Monk',
  'Burning Wizard',
  'Shining Cleric',
  'Bright Ranger',
  'Deep Warlock',
  'High Sorcerer',
  'Wide Druid',
];

const worlds = [
  'Gilgamesh',
  'Leviathan',
  'Sargatanas',
  'Adamantoise',
  'Cactuar',
  'Faerie',
  'Jenova',
  'Midgardsormr',
  'Siren',
  'Zalera',
  'Behemoth',
  'Excalibur',
  'Exodus',
  'Famfrit',
  'Hyperion',
  'Lamia',
  'Ultros',
];

const encounters = ['FRU', 'TOP', 'DSR', 'TEA', 'UWU', 'UCOB'];
const partyStatuses = ['Prog Party', 'Clear Party'];
const roles = ['Tank', 'Healer', 'DPS'];

const jobsByRole = {
  Tank: ['Paladin', 'Warrior', 'Dark Knight', 'Gunbreaker'],
  Healer: ['White Mage', 'Scholar', 'Astrologian', 'Sage'],
  DPS: [
    'Dragoon',
    'Monk',
    'Ninja',
    'Samurai',
    'Reaper',
    'Black Mage',
    'Summoner',
    'Red Mage',
    'Blue Mage',
    'Bard',
    'Machinist',
    'Dancer',
  ],
};

const progPointsByEncounter = {
  FRU: {
    'Prog Party': ['P1 Fatebreaker', 'P2 Light Rampant', 'P3 Utopian Sky'],
    'Clear Party': [
      'P4 Paradise Lost',
      'P5 Fulgent Blade 1 (Exalines 1)',
      'P5 Fulgent Blade 2 (Exalines 2)',
    ],
  },
  TOP: {
    'Prog Party': [
      'P1 Beetle/Final Omega',
      'P2 Party Synergy',
      'P3 Hello World',
    ],
    'Clear Party': ['P4 Blue Screen', 'P5 Run Dynamis', 'P6 Alpha Omega'],
  },
  DSR: {
    'Prog Party': [
      'P1 Door Boss',
      'P2 Sanctity of the Ward',
      'P3 Strength of the Ward',
    ],
    'Clear Party': [
      'P4 Wroth Flames',
      'P5 Death of the Heavens',
      'P6 Gigaflare',
      'P7 Dragon-king Thordan',
    ],
  },
  TEA: {
    'Prog Party': ['P1 Living Liquid', 'P2 Limit Cut', 'P3 Temporal Stasis'],
    'Clear Party': ['P4 Wormhole Formation', 'Perfect Alexander'],
  },
  UWU: {
    'Prog Party': ['P1 Garuda', 'P2 Ifrit', 'P3 Titan'],
    'Clear Party': ['P4 Lahabrea', 'P5 Ultima'],
  },
  UCOB: {
    'Prog Party': ['P1 Twintania', 'P2 Nael', 'P3 Bahamut Prime'],
    'Clear Party': ['P4 Adds Phase', 'P5 Golden Bahamut'],
  },
};

const availabilityOptions = [
  ['Monday 7PM EST', 'Wednesday 7PM EST', 'Friday 7PM EST'],
  ['Tuesday 8PM EST', 'Thursday 8PM EST'],
  ['Monday 8PM EST', 'Tuesday 8PM EST', 'Thursday 8PM EST'],
  ['Wednesday 9PM EST', 'Friday 9PM EST'],
  ['Thursday 9PM EST', 'Saturday 8PM EST'],
  ['Friday 8PM EST', 'Saturday 8PM EST', 'Sunday 8PM EST'],
  ['Tuesday 7PM EST', 'Thursday 7PM EST', 'Sunday 7PM EST'],
  ['Monday 9PM EST', 'Wednesday 9PM EST', 'Saturday 8PM EST'],
  ['Thursday 7PM EST', 'Sunday 7PM EST'],
  ['Tuesday 9PM EST', 'Thursday 9PM EST'],
  ['Monday 8PM EST', 'Friday 8PM EST'],
  ['Wednesday 8PM EST', 'Saturday 9PM EST'],
];

const squads = ['Sex Gods 3000', 'Space Travelers', null];

// Generate 100 mock signups
function generateMockSignups(): SignupDisplayData[] {
  const signups: SignupDisplayData[] = [];

  for (let i = 1; i <= 100; i++) {
    const role = roles[Math.floor(Math.random() * roles.length)] as
      | 'Tank'
      | 'Healer'
      | 'DPS';
    const encounter = encounters[
      Math.floor(Math.random() * encounters.length)
    ] as keyof typeof progPointsByEncounter;
    const partyStatus = partyStatuses[
      Math.floor(Math.random() * partyStatuses.length)
    ] as 'Prog Party' | 'Clear Party';
    const progPoints = progPointsByEncounter[encounter][partyStatus];

    signups.push({
      id: i.toString(),
      character:
        characterNames[Math.floor(Math.random() * characterNames.length)],
      world: worlds[Math.floor(Math.random() * worlds.length)],
      encounter: encounter as any,
      partyStatus,
      role,
      job: jobsByRole[role][
        Math.floor(Math.random() * jobsByRole[role].length)
      ],
      progPoint: progPoints[Math.floor(Math.random() * progPoints.length)],
      availability:
        availabilityOptions[
          Math.floor(Math.random() * availabilityOptions.length)
        ],
      discordId: `${Math.floor(Math.random() * 900000000) + 100000000}`,
      status: 'approved',
      lastUpdated: new Date(2024, 0, Math.floor(Math.random() * 30) + 1),
      schedulingStatus: 'unscheduled',
      squad: squads[Math.floor(Math.random() * squads.length)],
    });
  }

  return signups;
}

export const mockSignups = generateMockSignups();
