import { z } from 'zod/v4';

// Error codes as Zod enum for validation
export const APIErrorCodeSchema = z.enum([
  // Event errors
  'EVENT_NOT_FOUND',
  'EVENT_IN_PROGRESS',
  'INVALID_EVENT_STATUS',

  // Participant errors
  'PARTICIPANT_NOT_FOUND',
  'PARTICIPANT_LOCKED',
  'PARTICIPANT_UNAVAILABLE',
  'SLOT_NOT_FOUND',
  'SLOT_ALREADY_FILLED',

  // Lock errors
  'LOCK_NOT_FOUND',
  'LOCK_EXPIRED',
  'LOCK_HELD_BY_OTHER',

  // Validation errors
  'INVALID_REQUEST',
  'MISSING_REQUIRED_FIELD',
  'INVALID_DATE_RANGE',
]);

// Base API error schema
export const APIErrorSchema = z.object({
  code: APIErrorCodeSchema,
  message: z.string(),
  details: z.any().optional(),
});

// Conflict error schema (extends base error)
export const ConflictErrorSchema = APIErrorSchema.extend({
  code: z.literal('CONFLICT'),
  conflictType: z.enum([
    'already_selected',
    'being_drafted',
    'unavailable',
    'helper_conflict',
  ]),
  conflictDetails: z.object({
    currentHolder: z.string().optional(),
    lockExpiresAt: z.iso.datetime({ offset: true }).optional(),
    conflictingEventId: z.string().optional(),
  }),
});

// Validation error schema (extends base error)
export const ValidationErrorSchema = APIErrorSchema.extend({
  code: z.literal('INVALID_REQUEST'),
  validationErrors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
      value: z.any().optional(),
    }),
  ),
});

// Union of all possible error types
export const ErrorResponseSchema = z.discriminatedUnion('code', [
  APIErrorSchema,
  ConflictErrorSchema,
  ValidationErrorSchema,
]);

// Error messages mapping
export const APIErrorMessages = {
  EVENT_NOT_FOUND: 'Event does not exist',
  EVENT_IN_PROGRESS: 'Cannot modify events that are in progress',
  INVALID_EVENT_STATUS: 'Invalid status transition',

  PARTICIPANT_NOT_FOUND: 'Participant does not exist',
  PARTICIPANT_LOCKED: 'Participant is locked by another team leader',
  PARTICIPANT_UNAVAILABLE: 'Participant is not available at this time',
  SLOT_NOT_FOUND: 'Roster slot does not exist',
  SLOT_ALREADY_FILLED: 'Roster slot is already assigned',

  LOCK_NOT_FOUND: 'Draft lock does not exist',
  LOCK_EXPIRED: 'Draft lock has expired',
  LOCK_HELD_BY_OTHER: 'Lock is held by another team leader',

  INVALID_REQUEST: 'Request validation failed',
  MISSING_REQUIRED_FIELD: 'Required field is missing',
  INVALID_DATE_RANGE: 'Invalid date range specified',
} as const;

// Inferred types
export type APIErrorCode = z.infer<typeof APIErrorCodeSchema>;
export type APIError = z.infer<typeof APIErrorSchema>;
export type ConflictError = z.infer<typeof ConflictErrorSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
