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

// Note: Encounter, Job, Role, EventStatus, ParticipantType are now exported as native enums from the API schemas
// The old explicit types in encounters.ts and signup.ts are deprecated

// Utility functions can be added here in the future
// export * from './utils/index.js';
