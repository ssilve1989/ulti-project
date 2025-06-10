import { z } from 'zod/v4';
import {
  JobSchema,
  ParticipantTypeSchema,
  ScheduledEventSchema,
} from './common.js';

// POST /events/:eventId/roster/assign - Assign Participant
export const AssignParticipantParamsSchema = z.object({
  eventId: z.string(),
});

export const AssignParticipantQuerySchema = z.object({
  guildId: z.string(),
  teamLeaderId: z.string(),
});

export const AssignParticipantRequestSchema = z.object({
  participantId: z.string(),
  participantType: ParticipantTypeSchema,
  slotId: z.string(),
  selectedJob: JobSchema,
});

export const AssignParticipantResponseSchema = ScheduledEventSchema.extend({
  guildId: z.string(),
});

// DELETE /events/:eventId/roster/slots/:slotId - Unassign Participant
export const UnassignParticipantParamsSchema = z.object({
  eventId: z.string(),
  slotId: z.string(),
});

export const UnassignParticipantQuerySchema = z.object({
  guildId: z.string(),
  teamLeaderId: z.string(),
});

export const UnassignParticipantResponseSchema = ScheduledEventSchema.extend({
  guildId: z.string(),
});

// GET /events/:eventId/roster - Get Event Roster
export const GetEventRosterParamsSchema = z.object({
  eventId: z.string(),
});

export const GetEventRosterQuerySchema = z.object({
  guildId: z.string(),
});

export const GetEventRosterResponseSchema = ScheduledEventSchema.pick({
  roster: true,
  lastModified: true,
  version: true,
}).extend({
  guildId: z.string(),
});

// Inferred types
export type AssignParticipantParams = z.infer<
  typeof AssignParticipantParamsSchema
>;
export type AssignParticipantQuery = z.infer<
  typeof AssignParticipantQuerySchema
>;
export type AssignParticipantRequest = z.infer<
  typeof AssignParticipantRequestSchema
>;
export type AssignParticipantResponse = z.infer<
  typeof AssignParticipantResponseSchema
>;
export type UnassignParticipantParams = z.infer<
  typeof UnassignParticipantParamsSchema
>;
export type UnassignParticipantQuery = z.infer<
  typeof UnassignParticipantQuerySchema
>;
export type UnassignParticipantResponse = z.infer<
  typeof UnassignParticipantResponseSchema
>;
export type GetEventRosterParams = z.infer<typeof GetEventRosterParamsSchema>;
export type GetEventRosterQuery = z.infer<typeof GetEventRosterQuerySchema>;
export type GetEventRosterResponse = z.infer<
  typeof GetEventRosterResponseSchema
>;
