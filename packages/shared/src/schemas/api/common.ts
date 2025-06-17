import { z } from 'zod/v4';
import { Encounter } from '../../types/encounters.js';

// Native enum definitions
export enum Job {
  // Tanks
  Paladin = 'Paladin',
  Warrior = 'Warrior',
  DarkKnight = 'Dark Knight',
  Gunbreaker = 'Gunbreaker',
  // Healers
  WhiteMage = 'White Mage',
  Scholar = 'Scholar',
  Astrologian = 'Astrologian',
  Sage = 'Sage',
  // Melee DPS
  Dragoon = 'Dragoon',
  Monk = 'Monk',
  Ninja = 'Ninja',
  Samurai = 'Samurai',
  Reaper = 'Reaper',
  Viper = 'Viper',
  // Ranged Physical DPS
  Bard = 'Bard',
  Machinist = 'Machinist',
  Dancer = 'Dancer',
  // Ranged Magical DPS
  BlackMage = 'Black Mage',
  Summoner = 'Summoner',
  RedMage = 'Red Mage',
  Pictomancer = 'Pictomancer',
}

export enum Role {
  Tank = 'Tank',
  Healer = 'Healer',
  DPS = 'DPS',
}

export enum EventStatus {
  Draft = 'draft',
  Published = 'published',
  InProgress = 'in-progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum ParticipantType {
  Helper = 'helper',
  Progger = 'progger',
}

// Zod schemas using native enums
export const JobSchema = z.enum(Job);
export const EncounterSchema = z.enum(Encounter);
export const RoleSchema = z.enum(Role);
export const EventStatusSchema = z.enum(EventStatus);
export const ParticipantTypeSchema = z.enum(ParticipantType);

// Helper availability schemas
export const HelperTimeRangeSchema = z.object({
  start: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Must be in HH:MM format'),
  end: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Must be in HH:MM format'),
  timezone: z.string().optional(),
});

export const HelperWeeklyAvailabilitySchema = z.object({
  dayOfWeek: z.number().min(0).max(6), // 0 = Sunday, 6 = Saturday
  timeRanges: z.array(HelperTimeRangeSchema),
});

export const HelperAbsenceSchema = z.object({
  id: z.string(),
  helperId: z.string(),
  startDate: z.iso.datetime({ offset: true }),
  endDate: z.iso.datetime({ offset: true }),
  reason: z.string().optional(),
});

export const HelperJobSchema = z.object({
  job: JobSchema,
  role: RoleSchema,
});

export const HelperDataSchema = z.object({
  id: z.string(),
  discordId: z.string(),
  name: z.string(),
  availableJobs: z.array(HelperJobSchema),
  weeklyAvailability: z.array(HelperWeeklyAvailabilitySchema).optional(),
});

export const ParticipantSchema = z.object({
  type: ParticipantTypeSchema,
  id: z.string(),
  discordId: z.string(),
  name: z.string(),
  job: JobSchema,
  encounter: EncounterSchema.optional(),
  progPoint: z.string().optional(),
  availability: z.string().optional(),
  isConfirmed: z.boolean(),
});

export const PartySlotSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  jobRestriction: JobSchema.optional(),
  assignedParticipant: ParticipantSchema.optional(),
  isHelperSlot: z.boolean(),
  draftedBy: z.string().optional(),
  draftedAt: z.iso.datetime({ offset: true }).optional(),
});

export const EventRosterSchema = z.object({
  party: z.array(PartySlotSchema),
  totalSlots: z.number(),
  filledSlots: z.number(),
});

export const ScheduledEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  encounter: EncounterSchema,
  scheduledTime: z.iso.datetime({ offset: true }),
  duration: z.number().positive(),
  teamLeaderId: z.string(),
  teamLeaderName: z.string(),
  status: EventStatusSchema,
  roster: EventRosterSchema,
  createdAt: z.iso.datetime({ offset: true }),
  lastModified: z.iso.datetime({ offset: true }),
  version: z.number(),
});

export const DraftLockSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  participantId: z.string(),
  participantType: ParticipantTypeSchema,
  lockedBy: z.string(),
  lockedByName: z.string(),
  lockedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});

// Additional API request schemas
export const LockParticipantRequestSchema = z.object({
  participantId: z.string(),
  participantType: ParticipantTypeSchema,
  slotId: z.string().optional(),
});

export const EventFiltersSchema = z.object({
  teamLeaderId: z.string().optional(),
  status: EventStatusSchema.optional(),
  encounter: EncounterSchema.optional(),
  dateFrom: z.iso.datetime({ offset: true }).optional(),
  dateTo: z.iso.datetime({ offset: true }).optional(),
});

// Inferred types for complex objects (not enums)
export type HelperTimeRange = z.infer<typeof HelperTimeRangeSchema>;
export type HelperWeeklyAvailability = z.infer<
  typeof HelperWeeklyAvailabilitySchema
>;
export type HelperAbsence = z.infer<typeof HelperAbsenceSchema>;
export type HelperJob = z.infer<typeof HelperJobSchema>;
export type HelperData = z.infer<typeof HelperDataSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type PartySlot = z.infer<typeof PartySlotSchema>;
export type EventRoster = z.infer<typeof EventRosterSchema>;
export type ScheduledEvent = z.infer<typeof ScheduledEventSchema>;
export type DraftLock = z.infer<typeof DraftLockSchema>;
export type LockParticipantRequest = z.infer<
  typeof LockParticipantRequestSchema
>;
export type EventFilters = z.infer<typeof EventFiltersSchema>;
