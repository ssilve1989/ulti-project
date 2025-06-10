import { z } from 'zod/v4';
import {
  EncounterSchema,
  HelperAbsenceSchema,
  HelperDataSchema,
  HelperWeeklyAvailabilitySchema,
  JobSchema,
  RoleSchema,
} from './common.js';

// GET /helpers - Get All Helpers
export const GetHelpersQuerySchema = z.object({
  guildId: z.string(),
  encounter: EncounterSchema.optional(),
  role: RoleSchema.optional(),
  job: JobSchema.optional(),
  available: z.coerce.boolean().optional(),
  limit: z.coerce.number().positive().max(100).default(50),
  offset: z.coerce.number().nonnegative().default(0),
});

export const GetHelpersResponseSchema = z.object({
  helpers: z.array(HelperDataSchema.extend({ guildId: z.string() })),
  total: z.number(),
  hasMore: z.boolean(),
});

// GET /helpers/:id - Get Single Helper
export const GetHelperParamsSchema = z.object({
  id: z.string(),
});

export const GetHelperQuerySchema = z.object({
  guildId: z.string(),
});

export const GetHelperResponseSchema = HelperDataSchema.extend({
  guildId: z.string(),
});

// GET /helpers/:id/availability/check - Check Helper Availability
export const CheckHelperAvailabilityParamsSchema = z.object({
  id: z.string(),
});

export const CheckHelperAvailabilityQuerySchema = z.object({
  guildId: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

export const CheckHelperAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  reason: z.enum(['absent', 'outside_schedule', 'available']).optional(),
});

// POST /helpers/:id/availability - Set Helper Weekly Availability
export const SetHelperAvailabilityParamsSchema = z.object({
  id: z.string(),
});

export const SetHelperAvailabilityQuerySchema = z.object({
  guildId: z.string(),
});

export const SetHelperAvailabilityRequestSchema = z.object({
  weeklyAvailability: z.array(HelperWeeklyAvailabilitySchema),
});

export const SetHelperAvailabilityResponseSchema = HelperDataSchema.extend({
  guildId: z.string(),
});

// GET /helpers/:id/absences - Get Helper Absences
export const GetHelperAbsencesParamsSchema = z.object({
  id: z.string(),
});

export const GetHelperAbsencesQuerySchema = z.object({
  guildId: z.string(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const GetHelperAbsencesResponseSchema = z.array(
  HelperAbsenceSchema.extend({
    guildId: z.string(),
  }),
);

// POST /helpers/:id/absences - Create Helper Absence
export const CreateHelperAbsenceParamsSchema = z.object({
  id: z.string(),
});

export const CreateHelperAbsenceQuerySchema = z.object({
  guildId: z.string(),
});

export const CreateHelperAbsenceRequestSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().optional(),
  })
  .refine(
    (data) => data.startDate <= data.endDate,
    'Start date must be before or equal to end date',
  );

export const CreateHelperAbsenceResponseSchema = HelperAbsenceSchema.extend({
  guildId: z.string(),
});

// DELETE /helpers/:id/absences/:absenceId - Delete Helper Absence
export const DeleteHelperAbsenceParamsSchema = z.object({
  id: z.string(),
  absenceId: z.string(),
});

export const DeleteHelperAbsenceQuerySchema = z.object({
  guildId: z.string(),
});

export const DeleteHelperAbsenceResponseSchema = z.object({
  success: z.boolean(),
});

// Inferred types
export type GetHelpersQuery = z.infer<typeof GetHelpersQuerySchema>;
export type GetHelpersResponse = z.infer<typeof GetHelpersResponseSchema>;
export type GetHelperParams = z.infer<typeof GetHelperParamsSchema>;
export type GetHelperQuery = z.infer<typeof GetHelperQuerySchema>;
export type GetHelperResponse = z.infer<typeof GetHelperResponseSchema>;
export type CheckHelperAvailabilityParams = z.infer<
  typeof CheckHelperAvailabilityParamsSchema
>;
export type CheckHelperAvailabilityQuery = z.infer<
  typeof CheckHelperAvailabilityQuerySchema
>;
export type CheckHelperAvailabilityResponse = z.infer<
  typeof CheckHelperAvailabilityResponseSchema
>;
export type SetHelperAvailabilityParams = z.infer<
  typeof SetHelperAvailabilityParamsSchema
>;
export type SetHelperAvailabilityQuery = z.infer<
  typeof SetHelperAvailabilityQuerySchema
>;
export type SetHelperAvailabilityRequest = z.infer<
  typeof SetHelperAvailabilityRequestSchema
>;
export type SetHelperAvailabilityResponse = z.infer<
  typeof SetHelperAvailabilityResponseSchema
>;
export type GetHelperAbsencesParams = z.infer<
  typeof GetHelperAbsencesParamsSchema
>;
export type GetHelperAbsencesQuery = z.infer<
  typeof GetHelperAbsencesQuerySchema
>;
export type GetHelperAbsencesResponse = z.infer<
  typeof GetHelperAbsencesResponseSchema
>;
export type CreateHelperAbsenceParams = z.infer<
  typeof CreateHelperAbsenceParamsSchema
>;
export type CreateHelperAbsenceQuery = z.infer<
  typeof CreateHelperAbsenceQuerySchema
>;
export type CreateHelperAbsenceRequest = z.infer<
  typeof CreateHelperAbsenceRequestSchema
>;
export type CreateHelperAbsenceResponse = z.infer<
  typeof CreateHelperAbsenceResponseSchema
>;
export type DeleteHelperAbsenceParams = z.infer<
  typeof DeleteHelperAbsenceParamsSchema
>;
export type DeleteHelperAbsenceQuery = z.infer<
  typeof DeleteHelperAbsenceQuerySchema
>;
export type DeleteHelperAbsenceResponse = z.infer<
  typeof DeleteHelperAbsenceResponseSchema
>;
