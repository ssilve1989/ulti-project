import { Job, Role } from '@ulti-project/shared';

// Icon path utilities for FFXIV job and role icons
export const ICON_BASE_PATH = '/icons';

// Role icon paths
export const getRoleIconPath = (role: Role): string => {
  const roleMap = {
    [Role.Tank]: 'TankRole.png',
    [Role.Healer]: 'HealerRole.png',
    [Role.DPS]: 'DPSRole.png',
  };

  return `${ICON_BASE_PATH}/00_ROLE/${roleMap[role]}`;
};

// Job icon paths
export const getJobIconPath = (job: Job): string => {
  // Tank jobs
  const tankJobs = {
    Paladin: '01_TANK/Job/Paladin.png',
    Warrior: '01_TANK/Job/Warrior.png',
    'Dark Knight': '01_TANK/Job/DarkKnight.png',
    Gunbreaker: '01_TANK/Job/Gunbreaker.png',
  };

  // Healer jobs
  const healerJobs = {
    'White Mage': '02_HEALER/Job/WhiteMage.png',
    Scholar: '02_HEALER/Job/Scholar.png',
    Astrologian: '02_HEALER/Job/Astrologian.png',
    Sage: '02_HEALER/Job/Sage.png',
  };

  // DPS jobs
  const dpsJobs = {
    Monk: '03_DPS/Job/Monk.png',
    Dragoon: '03_DPS/Job/Dragoon.png',
    Ninja: '03_DPS/Job/Ninja.png',
    Samurai: '03_DPS/Job/Samurai.png',
    Reaper: '03_DPS/Job/Reaper.png',
    Bard: '03_DPS/Job/Bard.png',
    Machinist: '03_DPS/Job/Machinist.png',
    Dancer: '03_DPS/Job/Dancer.png',
    'Black Mage': '03_DPS/Job/BlackMage.png',
    Summoner: '03_DPS/Job/Summoner.png',
    'Red Mage': '03_DPS/Job/RedMage.png',
    Pictomancer: '03_DPS/Job/Pictomancer.png',
    Viper: '03_DPS/Job/Viper.png',
  };

  const allJobs = { ...tankJobs, ...healerJobs, ...dpsJobs };
  const iconPath = allJobs[job as keyof typeof allJobs];

  if (!iconPath) {
    console.warn(`No icon found for job: ${job}`);
    // Fallback to a generic role icon based on job name
    if (Object.keys(tankJobs).includes(job)) {
      return getRoleIconPath(Role.Tank);
    }
    if (Object.keys(healerJobs).includes(job)) {
      return getRoleIconPath(Role.Healer);
    }
    return getRoleIconPath(Role.DPS);
  }

  return `${ICON_BASE_PATH}/${iconPath}`;
};

// Job to role mapping utility
export const getJobRole = (job: Job): Role => {
  const tankJobs = ['Paladin', 'Warrior', 'Dark Knight', 'Gunbreaker'];
  const healerJobs = ['White Mage', 'Scholar', 'Astrologian', 'Sage'];

  if (tankJobs.includes(job)) return Role.Tank;
  if (healerJobs.includes(job)) return Role.Healer;
  return Role.DPS;
};
