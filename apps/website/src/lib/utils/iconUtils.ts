import { Job, Role } from '@ulti-project/shared';

// Icon path utilities for FFXIV job and role icons
export const ICON_BASE_PATH = '/icons';

// Preload critical icons on page load
export const CRITICAL_ICONS = ['TankRole.png', 'HealerRole.png', 'DPSRole.png'];

// Regex for file extension replacement
const FILE_EXTENSION_REGEX = /\.[^.]+$/;

// Get icon format based on browser support
export const getOptimalIconFormat = (basePath: string, hasWebP = true) => {
  // In a production environment, you might want to detect WebP support
  // For now, we'll assume modern browser support
  if (basePath.endsWith('.png')) {
    return hasWebP ? basePath.replace(FILE_EXTENSION_REGEX, '.webp') : basePath;
  }
  return basePath;
};

// Enhanced role icon paths with format optimization
export const getRoleIconPath = (role: Role, preferWebP = true) => {
  const roleMap = {
    [Role.Tank]: 'TankRole.png',
    [Role.Healer]: 'HealerRole.png',
    [Role.DPS]: 'DPSRole.png',
  };

  const basePath = `${ICON_BASE_PATH}/00_ROLE/${roleMap[role]}`;
  return preferWebP ? getOptimalIconFormat(basePath) : basePath;
};

// Get icon dimensions for better CLS (Cumulative Layout Shift) prevention
export const getIconDimensions = (type: 'role' | 'job') => {
  return type === 'role'
    ? { width: 20, height: 20 }
    : { width: 24, height: 24 };
};

// Generate preload links for critical icons
export const generateIconPreloads = (icons: string[]) => {
  return icons.map((icon) => ({
    rel: 'preload',
    as: 'image',
    href: `${ICON_BASE_PATH}/00_ROLE/${icon}`,
    type: 'image/png',
  }));
};

// Job icon paths
export const getJobIconPath = (job: Job, preferWebP = true) => {
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
      return getRoleIconPath(Role.Tank, preferWebP);
    }
    if (Object.keys(healerJobs).includes(job)) {
      return getRoleIconPath(Role.Healer, preferWebP);
    }
    return getRoleIconPath(Role.DPS, preferWebP);
  }

  const basePath = `${ICON_BASE_PATH}/${iconPath}`;
  return preferWebP ? getOptimalIconFormat(basePath) : basePath;
};

// Job to role mapping utility
export const getJobRole = (job: Job): Role => {
  const tankJobs = ['Paladin', 'Warrior', 'Dark Knight', 'Gunbreaker'];
  const healerJobs = ['White Mage', 'Scholar', 'Astrologian', 'Sage'];

  if (tankJobs.includes(job)) return Role.Tank;
  if (healerJobs.includes(job)) return Role.Healer;
  return Role.DPS;
};

// Helper functions for React components to easily get optimized icon props
export const getJobIconProps = (job: Job, preferWebP = true) => {
  return {
    iconPath: getJobIconPath(job, preferWebP),
    alt: `${job} job`,
    type: 'job' as const,
  };
};

export const getRoleIconProps = (role: Role, preferWebP = true) => {
  return {
    iconPath: getRoleIconPath(role, preferWebP),
    alt: `${role} role`,
    type: 'role' as const,
  };
};
