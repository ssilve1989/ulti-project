import { Encounter, ParticipantType } from '@ulti-project/shared';
import type { Job, Participant, Role } from '@ulti-project/shared';
import { MOCK_CONFIG, delay } from './config.js';
import { getHelperById } from './helpers.js';
import { getHelpers } from './helpers.js';

// Import existing signup data - we'll need to adapt this to work with the existing mockData
// For now, creating some mock proggers that match the scheduling system requirements
const mockProggers: Participant[] = [
  {
    type: ParticipantType.Progger,
    id: 'progger-1',
    discordId: '111111111111111111',
    name: 'Warrior Light',
    job: 'Black Mage' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P2 Light Rampant',
    availability: 'Tuesday 8PM EST, Thursday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-2',
    discordId: '222222222222222222',
    name: 'Astral Healer',
    job: 'White Mage' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P5 Fulgent Blade 1 (Exalines 1)',
    availability: 'Monday 7PM EST, Wednesday 7PM EST, Friday 7PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-3',
    discordId: '333333333333333333',
    name: 'Aether Striker',
    job: 'Dragoon' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P2 Light Rampant',
    availability: 'Thursday 9PM EST, Saturday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-4',
    discordId: '444444444444444444',
    name: 'Crystal Guardian',
    job: 'Paladin' as Job,
    encounter: Encounter.TOP,
    progPoint: 'P2 Party Synergy',
    availability: 'Monday 8PM EST, Wednesday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-5',
    discordId: '555555555555555555',
    name: 'Void Caster',
    job: 'Summoner' as Job,
    encounter: Encounter.DSR,
    progPoint: 'P3 Strength of the Ward',
    availability: 'Tuesday 7PM EST, Friday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-6',
    discordId: '666666666666666666',
    name: 'Divine Scholar',
    job: 'Scholar' as Job,
    encounter: Encounter.TEA,
    progPoint: 'P3 Temporal Stasis',
    availability: 'Sunday 6PM EST, Thursday 7PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-7',
    discordId: '777777777777777777',
    name: 'Storm Breaker',
    job: 'Warrior' as Job,
    encounter: Encounter.UWU,
    progPoint: 'P3 Titan',
    availability: 'Wednesday 9PM EST, Saturday 7PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-8',
    discordId: '888888888888888888',
    name: 'Lunar Sage',
    job: 'Astrologian' as Job,
    encounter: Encounter.UCOB,
    progPoint: 'P2 Nael',
    availability: 'Monday 9PM EST, Friday 7PM EST',
    isConfirmed: false,
  },
  // Additional proggers for better testing coverage
  {
    type: ParticipantType.Progger,
    id: 'progger-9',
    discordId: '999999999999999999',
    name: 'Edge Walker',
    job: 'Reaper' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P1 Cyclonic Break',
    availability: 'Tuesday 8PM EST, Thursday 9PM EST, Sunday 6PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-10',
    discordId: '101010101010101010',
    name: 'Shadow Blade',
    job: 'Ninja' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P5 Fulgent Blade 2',
    availability: 'Monday 7PM EST, Wednesday 8PM EST, Friday 9PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-11',
    discordId: '111111111111111112',
    name: 'Frost Arrow',
    job: 'Bard' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P2 Light Rampant',
    availability: 'Tuesday 7PM EST, Thursday 8PM EST, Saturday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-12',
    discordId: '121212121212121212',
    name: 'Steel Dancer',
    job: 'Gunbreaker' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P1 Cyclonic Break',
    availability: 'Monday 8PM EST, Wednesday 7PM EST, Friday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-13',
    discordId: '131313131313131313',
    name: 'Fire Sage',
    job: 'Sage' as Job,
    encounter: Encounter.DSR,
    progPoint: 'P1 Thordan',
    availability: 'Tuesday 9PM EST, Saturday 7PM EST, Sunday 7PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-14',
    discordId: '141414141414141414',
    name: 'Wind Spirit',
    job: 'Machinist' as Job,
    encounter: Encounter.TOP,
    progPoint: 'P1 Omega',
    availability: 'Wednesday 8PM EST, Thursday 7PM EST, Sunday 8PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-15',
    discordId: '151515151515151515',
    name: 'Thunder Strike',
    job: 'Dark Knight' as Job,
    encounter: Encounter.DSR,
    progPoint: 'P2 Nidhogg',
    availability: 'Monday 9PM EST, Thursday 8PM EST, Saturday 9PM EST',
    isConfirmed: false,
  },
  // Additional tank proggers to ensure adequate tank coverage
  {
    type: ParticipantType.Progger,
    id: 'progger-16',
    discordId: '161616161616161616',
    name: 'Ocean Depths',
    job: 'Paladin' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P3 Utopian Sky',
    availability: 'Monday 8PM EST, Wednesday 8PM EST, Saturday 7PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-17',
    discordId: '171717171717171717',
    name: 'Crystal Song',
    job: 'Warrior' as Job,
    encounter: Encounter.DSR,
    progPoint: 'P1 Thordan',
    availability: 'Tuesday 7PM EST, Thursday 8PM EST, Sunday 6PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-18',
    discordId: '181818181818181818',
    name: 'Star Guardian',
    job: 'Gunbreaker' as Job,
    encounter: Encounter.TOP,
    progPoint: 'P2 Pantokrator',
    availability: 'Wednesday 9PM EST, Friday 8PM EST, Saturday 9PM EST',
    isConfirmed: false,
  },
  {
    type: ParticipantType.Progger,
    id: 'progger-19',
    discordId: '191919191919191919',
    name: 'Mystic Blade',
    job: 'Dark Knight' as Job,
    encounter: Encounter.FRU,
    progPoint: 'P4 Diamond Dust',
    availability: 'Monday 9PM EST, Thursday 9PM EST, Sunday 8PM EST',
    isConfirmed: false,
  },
];

// API Functions
export async function getProggers(filters?: {
  encounter?: string;
  role?: string;
  job?: string;
  progPoint?: string;
}): Promise<Participant[]> {
  await delay(MOCK_CONFIG.delays.medium);

  let filtered = [...mockProggers];

  if (filters?.encounter) {
    filtered = filtered.filter((p) => p.encounter === filters.encounter);
  }

  if (filters?.job) {
    filtered = filtered.filter((p) => p.job === filters.job);
  }

  if (filters?.progPoint) {
    filtered = filtered.filter(
      (p) => p.progPoint?.includes(filters.progPoint || '') || false,
    );
  }

  return filtered;
}

export async function getProgger(id: string): Promise<Participant | null> {
  await delay(MOCK_CONFIG.delays.fast);
  return mockProggers.find((p) => p.id === id) || null;
}

export async function getAllParticipants(filters?: {
  encounter?: string;
  role?: string;
  type?: 'helper' | 'progger';
}): Promise<Participant[]> {
  await delay(MOCK_CONFIG.delays.medium);

  const participants: Participant[] = [];

  // Add proggers
  if (!filters?.type || filters.type === 'progger') {
    const proggers = await getProggers({
      encounter: filters?.encounter,
      role: filters?.role,
    });
    participants.push(...proggers);
  }

  // Add helpers (convert from HelperData to Participant format)
  if (!filters?.type || filters.type === 'helper') {
    const { getHelpers } = await import('./helpers.js');
    const helpers = await getHelpers();

    for (const helper of helpers) {
      // Create a participant entry for each job the helper can play
      for (const helperJob of helper.availableJobs) {
        if (!filters?.role || helperJob.role === filters.role) {
          participants.push({
            type: ParticipantType.Helper,
            id: helper.id,
            discordId: helper.discordId,
            name: helper.name,
            job: helperJob.job,
            isConfirmed: false,
          });
        }
      }
    }
  }

  return participants;
}

// New unified function for API specification compliance
export async function getParticipantsWithGuild(
  guildId: string,
  filters?: {
    encounter?: string;
    type?: ParticipantType;
    role?: Role;
    job?: Job;
  },
): Promise<Participant[]> {
  // Validate guild context
  if (!guildId || guildId !== MOCK_CONFIG.guild.defaultGuildId) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }

  let participants: Participant[] = [];

  // Get helpers if requested
  if (!filters?.type || filters.type === ParticipantType.Helper) {
    const helpers = await getHelpers();
    const helperParticipants = helpers.map((helper) => ({
      type: ParticipantType.Helper,
      id: helper.id,
      discordId: helper.discordId,
      name: helper.name,
      job: helper.availableJobs[0]?.job || ('Paladin' as Job),
      isConfirmed: false,
    }));
    participants.push(...helperParticipants);
  }

  // Get proggers if requested
  if (!filters?.type || filters.type === ParticipantType.Progger) {
    const proggers = await getProggers(filters);
    participants.push(...proggers);
  }

  // Apply additional filters
  if (filters?.encounter) {
    participants = participants.filter(
      (p) => p.encounter === filters.encounter,
    );
  }

  if (filters?.role) {
    // Filter helpers by role
    if (filters.type === ParticipantType.Helper || !filters.type) {
      const helperParticipants = participants.filter(
        (p) => p.type === ParticipantType.Helper,
      );
      for (const participant of helperParticipants) {
        const helper = await getHelperById(participant.id);
        if (!helper?.availableJobs.some((job) => job.role === filters.role)) {
          participants = participants.filter((p) => p.id !== participant.id);
        }
      }
    }
    // For proggers, we need to derive role from job
    // This is a simplified approach - in a real implementation,
    // you'd have a job-to-role mapping
  }

  if (filters?.job) {
    participants = participants.filter((p) => p.job === filters.job);
  }

  return participants;
}

// Get participant by ID and type
export async function getParticipant(
  id: string,
  type: 'helper' | 'progger',
): Promise<Participant | null> {
  await delay(MOCK_CONFIG.delays.fast);

  if (type === 'progger') {
    return getProgger(id);
  }

  const helper = getHelperById(id);
  if (!helper) return null;

  // Return the first available job for the helper
  const firstJob = helper.availableJobs[0];
  if (!firstJob) return null;

  return {
    type: ParticipantType.Helper,
    id: helper.id,
    discordId: helper.discordId,
    name: helper.name,
    job: firstJob.job,
    isConfirmed: false,
  };
}

// Check if participant is available for a specific time slot
export async function isParticipantAvailable(
  participantId: string,
  participantType: 'helper' | 'progger',
  startTime: Date,
  endTime: Date,
): Promise<boolean> {
  await delay(MOCK_CONFIG.delays.fast);

  if (participantType === 'helper') {
    const { isHelperAvailable } = await import('./helpers.js');
    return isHelperAvailable(participantId, startTime, endTime);
  }

  // For proggers, we don't have structured availability data
  // In a real implementation, this might check against their availability text
  // or other scheduling conflicts
  return true;
}

// Update participant confirmation status
export async function updateParticipantConfirmation(
  participantId: string,
  participantType: 'helper' | 'progger',
  isConfirmed: boolean,
): Promise<void> {
  await delay(MOCK_CONFIG.delays.fast);

  if (participantType === 'progger') {
    const progger = mockProggers.find((p) => p.id === participantId);
    if (progger) {
      progger.isConfirmed = isConfirmed;
    }
  }

  // For helpers, confirmation status would be managed per-event
  // rather than globally, so this is handled in the events API
}

// Utility functions for other mock APIs
export function getProggerById(id: string): Participant | undefined {
  return mockProggers.find((p) => p.id === id);
}

export function updateProggerConfirmation(
  id: string,
  isConfirmed: boolean,
): void {
  const progger = mockProggers.find((p) => p.id === id);
  if (progger) {
    progger.isConfirmed = isConfirmed;
  }
}
