import { z } from 'zod/v4';
import {
  EncounterSchema,
  ParticipantSchema,
  ParticipantTypeSchema,
  RoleSchema,
} from './common.js';

// GET /participants - Get All Participants
export const GetParticipantsQuerySchema = z.object({
  guildId: z.string(),
  type: ParticipantTypeSchema.optional(),
  encounter: EncounterSchema.optional(),
  role: RoleSchema.optional(),
  limit: z.coerce.number().positive().max(100).default(50),
  offset: z.coerce.number().nonnegative().default(0),
});

export const GetParticipantsResponseSchema = z.array(ParticipantSchema);

// GET /participants/stream - SSE Stream for Participant Updates
export const GetParticipantsStreamQuerySchema = z.object({
  guildId: z.string(),
  type: ParticipantTypeSchema.optional(),
});

// SSE Events for Participants Stream
export const ParticipantsUpdatedEventSchema = z.object({
  type: z.literal('participants_updated'),
  data: z.array(ParticipantSchema),
  timestamp: z.coerce.date(),
});

export const SignupApprovedEventSchema = z.object({
  type: z.literal('signup_approved'),
  data: z.object({
    participant: ParticipantSchema,
  }),
  timestamp: z.coerce.date(),
});

// Union of all participant stream events
export const ParticipantsStreamEventSchema = z.discriminatedUnion('type', [
  ParticipantsUpdatedEventSchema,
  SignupApprovedEventSchema,
]);

// Inferred types
export type GetParticipantsQuery = z.infer<typeof GetParticipantsQuerySchema>;
export type GetParticipantsResponse = z.infer<
  typeof GetParticipantsResponseSchema
>;
export type GetParticipantsStreamQuery = z.infer<
  typeof GetParticipantsStreamQuerySchema
>;
export type ParticipantsUpdatedEvent = z.infer<
  typeof ParticipantsUpdatedEventSchema
>;
export type SignupApprovedEvent = z.infer<typeof SignupApprovedEventSchema>;
export type ParticipantsStreamEvent = z.infer<
  typeof ParticipantsStreamEventSchema
>;
