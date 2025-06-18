// Export all API schemas for validation
export * from './schemas/index.js';

// Export non-API specific types
export type {
  Squad,
  ProgRequirement,
  SocialLinks,
  CommunityStats,
} from './types/community.js';

export type {
  SchedulingStatus,
  SignupDocument,
  SignupDisplayData,
  SignupFilters,
  SignupsResponse,
  CreateSignupDocumentProps,
  SignupCompositeKeyProps,
} from './types/signup.js';

// Export enum values from signup types
export {
  SignupStatus,
  PartyStatus,
} from './types/signup.js';

// // Export specific scheduling types that don't conflict with schemas
// export type {
//   HelperAvailabilityResponse,
//   SetHelperAvailabilityRequest,
//   CreateAbsenceRequest,
//   AssignParticipantRequest,
//   SSEEvent,
//   EventUpdateEvent,
//   DraftLockEvent,
//   ParticipantAssignedEvent,
//   HelperAvailabilityChangedEvent,
//   HelpersUpdatedEvent,
//   SchedulingSSEEvent,
// } from './types/scheduling.js';

// Export all encounter types (includes Encounter enum)
export * from './types/encounters.js';

// Re-export the enums from schemas for easy access (excluding Encounter to avoid conflict)
export {
  Job,
  Role,
  EventStatus,
  ParticipantType,
} from './schemas/api/common.js';
