import { z } from 'zod/v4';
import { DraftLockSchema, ParticipantTypeSchema } from './common.js';

// GET /events/:eventId/locks - Get Active Locks
export const GetActiveLocksParamsSchema = z.object({
  eventId: z.string(),
});

export const GetActiveLocksQuerySchema = z.object({
  guildId: z.string(),
});

export const GetActiveLocksResponseSchema = z.array(
  DraftLockSchema.extend({
    guildId: z.string(),
  }),
);

// POST /events/:eventId/locks - Create Draft Lock
export const CreateDraftLockParamsSchema = z.object({
  eventId: z.string(),
});

export const CreateDraftLockQuerySchema = z.object({
  guildId: z.string(),
  teamLeaderId: z.string(),
});

export const CreateDraftLockRequestSchema = z.object({
  participantId: z.string(),
  participantType: ParticipantTypeSchema,
  slotId: z.string().optional(),
});

export const CreateDraftLockResponseSchema = DraftLockSchema.extend({
  guildId: z.string(),
});

// DELETE /events/:eventId/locks/:participantType/:participantId - Release Lock
export const ReleaseDraftLockParamsSchema = z.object({
  eventId: z.string(),
  participantType: ParticipantTypeSchema,
  participantId: z.string(),
});

export const ReleaseDraftLockQuerySchema = z.object({
  guildId: z.string(),
  teamLeaderId: z.string(),
});

export const ReleaseDraftLockResponseSchema = z.object({
  success: z.boolean(),
});

// DELETE /events/:eventId/locks/team-leader/:teamLeaderId - Release All Locks by Team Leader
export const ReleaseAllLocksParamsSchema = z.object({
  eventId: z.string(),
  teamLeaderId: z.string(),
});

export const ReleaseAllLocksQuerySchema = z.object({
  guildId: z.string(),
});

export const ReleaseAllLocksResponseSchema = z.object({
  success: z.boolean(),
  releasedLocks: z.number(),
});

// GET /events/:eventId/locks/team-leader/:teamLeaderId - Get Locks by Team Leader
export const GetLocksByTeamLeaderParamsSchema = z.object({
  eventId: z.string(),
  teamLeaderId: z.string(),
});

export const GetLocksByTeamLeaderQuerySchema = z.object({
  guildId: z.string(),
});

export const GetLocksByTeamLeaderResponseSchema = z.array(
  DraftLockSchema.extend({
    guildId: z.string(),
  }),
);

// Inferred types
export type GetActiveLocksParams = z.infer<typeof GetActiveLocksParamsSchema>;
export type GetActiveLocksQuery = z.infer<typeof GetActiveLocksQuerySchema>;
export type GetActiveLocksResponse = z.infer<
  typeof GetActiveLocksResponseSchema
>;
export type CreateDraftLockParams = z.infer<typeof CreateDraftLockParamsSchema>;
export type CreateDraftLockQuery = z.infer<typeof CreateDraftLockQuerySchema>;
export type CreateDraftLockRequest = z.infer<
  typeof CreateDraftLockRequestSchema
>;
export type CreateDraftLockResponse = z.infer<
  typeof CreateDraftLockResponseSchema
>;
export type ReleaseDraftLockParams = z.infer<
  typeof ReleaseDraftLockParamsSchema
>;
export type ReleaseDraftLockQuery = z.infer<typeof ReleaseDraftLockQuerySchema>;
export type ReleaseDraftLockResponse = z.infer<
  typeof ReleaseDraftLockResponseSchema
>;
export type ReleaseAllLocksParams = z.infer<typeof ReleaseAllLocksParamsSchema>;
export type ReleaseAllLocksQuery = z.infer<typeof ReleaseAllLocksQuerySchema>;
export type ReleaseAllLocksResponse = z.infer<
  typeof ReleaseAllLocksResponseSchema
>;
export type GetLocksByTeamLeaderParams = z.infer<
  typeof GetLocksByTeamLeaderParamsSchema
>;
export type GetLocksByTeamLeaderQuery = z.infer<
  typeof GetLocksByTeamLeaderQuerySchema
>;
export type GetLocksByTeamLeaderResponse = z.infer<
  typeof GetLocksByTeamLeaderResponseSchema
>;
