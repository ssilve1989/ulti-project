import type {
  DraftLock,
  EventRoster,
  HelperAbsence,
  HelperData,
  HelperJob,
  HelperWeeklyAvailability,
  PartySlot,
  ScheduledEvent,
} from '@ulti-project/shared';
import {
  Encounter,
  EventStatus,
  Job,
  ParticipantType,
  Role,
} from '@ulti-project/shared';

// Helper function to generate random IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Helper function to generate random dates as ISO strings
const randomDate = (start: Date, end: Date) =>
  new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  ).toISOString();

// Mock guild ID for consistency
export const MOCK_GUILD_ID = '913492538516717578';

// Character names pool
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
];

// Generate mock roster
const generateMockRoster = (): EventRoster => {
  const party: PartySlot[] = [];

  // Add tank slots
  for (let i = 0; i < 2; i++) {
    const tankJobs = [Job.Paladin, Job.Warrior, Job.DarkKnight, Job.Gunbreaker];
    party.push({
      id: generateId(),
      role: Role.Tank,
      isHelperSlot: Math.random() > 0.5,
      jobRestriction:
        Math.random() > 0.7
          ? tankJobs[Math.floor(Math.random() * tankJobs.length)]
          : undefined,
      assignedParticipant:
        Math.random() > 0.3
          ? {
              type:
                Math.random() > 0.5
                  ? ParticipantType.Helper
                  : ParticipantType.Progger,
              id: generateId(),
              discordId: generateId(),
              name: characterNames[
                Math.floor(Math.random() * characterNames.length)
              ],
              job: tankJobs[Math.floor(Math.random() * tankJobs.length)],
              isConfirmed: Math.random() > 0.2,
              encounter:
                Math.random() > 0.5
                  ? Object.values(Encounter)[
                      Math.floor(
                        Math.random() * Object.values(Encounter).length,
                      )
                    ]
                  : undefined,
              progPoint: Math.random() > 0.5 ? 'P1' : undefined,
              availability: Math.random() > 0.5 ? 'Available' : undefined,
            }
          : undefined,
    });
  }

  // Add healer slots
  for (let i = 0; i < 2; i++) {
    const healerJobs = [Job.WhiteMage, Job.Scholar, Job.Astrologian, Job.Sage];
    party.push({
      id: generateId(),
      role: Role.Healer,
      isHelperSlot: Math.random() > 0.5,
      assignedParticipant:
        Math.random() > 0.3
          ? {
              type:
                Math.random() > 0.5
                  ? ParticipantType.Helper
                  : ParticipantType.Progger,
              id: generateId(),
              discordId: generateId(),
              name: characterNames[
                Math.floor(Math.random() * characterNames.length)
              ],
              job: healerJobs[Math.floor(Math.random() * healerJobs.length)],
              isConfirmed: Math.random() > 0.2,
            }
          : undefined,
    });
  }

  // Add DPS slots
  for (let i = 0; i < 4; i++) {
    const dpsJobs = Object.values(Job).filter(
      (j) =>
        ![
          Job.Paladin,
          Job.Warrior,
          Job.DarkKnight,
          Job.Gunbreaker,
          Job.WhiteMage,
          Job.Scholar,
          Job.Astrologian,
          Job.Sage,
        ].includes(j),
    );

    party.push({
      id: generateId(),
      role: Role.DPS,
      isHelperSlot: Math.random() > 0.5,
      assignedParticipant:
        Math.random() > 0.3
          ? {
              type:
                Math.random() > 0.5
                  ? ParticipantType.Helper
                  : ParticipantType.Progger,
              id: generateId(),
              discordId: generateId(),
              name: characterNames[
                Math.floor(Math.random() * characterNames.length)
              ],
              job: dpsJobs[Math.floor(Math.random() * dpsJobs.length)],
              isConfirmed: Math.random() > 0.2,
            }
          : undefined,
    });
  }

  const filledSlots = party.filter((slot) => slot.assignedParticipant).length;

  return {
    party,
    totalSlots: party.length,
    filledSlots,
  };
};

// Generate mock events
export const generateMockEvents = (count = 10) => {
  const events: ScheduledEvent[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const scheduledTime = randomDate(
      new Date(now.getTime() + i * 24 * 60 * 60 * 1000), // Start from today + i days
      new Date(now.getTime() + (i + 7) * 24 * 60 * 60 * 1000), // End at today + i + 7 days
    );

    events.push({
      id: generateId(),
      name: `${Object.values(Encounter)[i % Object.values(Encounter).length]} Practice ${i + 1}`,
      encounter: Object.values(Encounter)[i % Object.values(Encounter).length],
      scheduledTime,
      duration: [2, 3, 4][Math.floor(Math.random() * 3)], // 2-4 hours
      teamLeaderId: generateId(),
      teamLeaderName:
        characterNames[Math.floor(Math.random() * characterNames.length)],
      status:
        Object.values(EventStatus)[
          Math.floor(Math.random() * Object.values(EventStatus).length)
        ],
      roster: generateMockRoster(),
      createdAt: new Date(
        now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      lastModified: new Date().toISOString(),
      version: 1,
    });
  }

  return events;
};

// Helper function to get role for job
const getRoleForJob = (job: Job): Role => {
  const tankJobs = [Job.Paladin, Job.Warrior, Job.DarkKnight, Job.Gunbreaker];
  const healerJobs = [Job.WhiteMage, Job.Scholar, Job.Astrologian, Job.Sage];

  if (tankJobs.includes(job)) return Role.Tank;
  if (healerJobs.includes(job)) return Role.Healer;
  return Role.DPS;
};

// Generate mock helpers
export const generateMockHelpers = (count = 15) => {
  const helpers: HelperData[] = [];

  for (let i = 0; i < count; i++) {
    const weeklyAvailability: HelperWeeklyAvailability[] = [];

    // Generate availability for each day of the week
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      if (Math.random() > 0.3) {
        // 70% chance of being available on any given day
        weeklyAvailability.push({
          dayOfWeek,
          timeRanges: [
            {
              start: '19:00',
              end: dayOfWeek >= 5 ? '01:00' : '23:00', // Later on weekends
              timezone: 'America/New_York',
            },
          ],
        });
      }
    }

    // Generate available jobs
    const jobCount = Math.floor(Math.random() * 5) + 1;
    const allJobs = Object.values(Job);
    const availableJobs: HelperJob[] = [];

    for (let j = 0; j < jobCount; j++) {
      const job = allJobs[Math.floor(Math.random() * allJobs.length)];
      if (!availableJobs.some((aj) => aj.job === job)) {
        availableJobs.push({
          job,
          role: getRoleForJob(job),
        });
      }
    }

    helpers.push({
      id: generateId(),
      discordId: generateId(),
      name: characterNames[i % characterNames.length],
      availableJobs,
      weeklyAvailability,
    });
  }

  return helpers;
};

// Generate mock helper absences
export const generateMockHelperAbsences = (helperId: string, count = 3) => {
  const absences: HelperAbsence[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const startDate = randomDate(
      new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000),
      new Date(now.getTime() + (i + 4) * 7 * 24 * 60 * 60 * 1000),
    );
    const endDate = new Date(
      new Date(startDate).getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    absences.push({
      id: generateId(),
      helperId,
      startDate,
      endDate,
      reason: ['Vacation', 'Work', 'Personal', 'Medical'][
        Math.floor(Math.random() * 4)
      ],
    });
  }

  return absences;
};

// Generate mock draft locks
export const generateMockDraftLocks = (eventId: string, count = 5) => {
  const locks: DraftLock[] = [];

  for (let i = 0; i < count; i++) {
    const lockerId = generateId();
    locks.push({
      id: generateId(),
      eventId,
      participantType:
        Math.random() > 0.5 ? ParticipantType.Helper : ParticipantType.Progger,
      participantId: generateId(),
      lockedBy: lockerId,
      lockedByName: `Team Leader ${lockerId.substring(0, 8)}`,
      lockedAt: new Date(
        Date.now() - Math.random() * 60 * 60 * 1000,
      ).toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
    });
  }

  return locks;
};

// In-memory storage for mock data (simulates database)
const mockEvents = generateMockEvents(15);
const mockHelpers = generateMockHelpers(20);
const mockHelperAbsences = new Map<string, HelperAbsence[]>();
const mockDraftLocks = new Map<string, DraftLock[]>();

// Initialize some helper absences
for (const helper of mockHelpers) {
  mockHelperAbsences.set(helper.id, generateMockHelperAbsences(helper.id));
}

// Initialize some draft locks for events
for (const event of mockEvents.slice(0, 5)) {
  mockDraftLocks.set(event.id, generateMockDraftLocks(event.id));
}

// Export the in-memory storage and generators
export {
  mockEvents,
  mockHelpers,
  mockHelperAbsences,
  mockDraftLocks,
  characterNames,
};
