import { Encounter, ParticipantType } from '@ulti-project/shared';
import type { Job, Participant } from '@ulti-project/shared';
import { MOCK_CONFIG, delay } from './config.js';
import { getHelperById } from './helpers.js';

// Import existing signup data - we'll need to adapt this to work with the existing mockData
// For now, creating some mock proggers that match the scheduling system requirements
const mockProggers: Participant[] = [
  {
    type: ParticipantType.Progger,
    id: 'progger-1',
    discordId: '111111111111111111',
    name: 'ProggerOne',
    characterName: 'Warrior Light',
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
    name: 'ProggerTwo',
    characterName: 'Astral Healer',
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
    name: 'ProggerThree',
    characterName: 'Aether Striker',
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
    name: 'ProggerFour',
    characterName: 'Crystal Guardian',
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
    name: 'ProggerFive',
    characterName: 'Void Caster',
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
    name: 'ProggerSix',
    characterName: 'Divine Scholar',
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
    name: 'ProggerSeven',
    characterName: 'Storm Breaker',
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
    name: 'ProggerEight',
    characterName: 'Lunar Sage',
    job: 'Astrologian' as Job,
    encounter: Encounter.UCOB,
    progPoint: 'P2 Nael',
    availability: 'Monday 9PM EST, Friday 7PM EST',
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
